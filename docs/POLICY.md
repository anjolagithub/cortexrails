# Policy

`LedgerLinePolicy.canExecute` is CortexRails' entire reusable policy
surface. This document describes exactly what it does today, from
`contracts/src/LedgerLinePolicy.sol`, and nothing it doesn't yet do.

```solidity
function canExecute(
    uint256 assetId,
    uint256 positionId,
    Action action,
    uint256 amount
) external view returns (PolicyResponse memory response);
```

## Parameters

- **`assetId`** — which asset (and therefore which `AssetState` row in
  Registry) this call concerns. The live deployment configures exactly
  one asset, `assetId = 1` (TSLA).
- **`positionId`** — an opaque `uint256` identifying the position being
  evaluated. Registry itself has no notion of "users"; every current
  consumer derives it the same way, `uint256(uint160(userAddress))`
  (`LedgerLineClient.positionIdFromAddress` in the SDK does this too),
  but Policy and Registry don't enforce that convention — a consumer
  could use any scheme.
- **`action`** — one of `BORROW`, `WITHDRAW`, `TRANSFER`,
  `INCREASE_LEVERAGE`, `LIQUIDATE` (`Action` enum,
  `LedgerLineTypes.sol`). `BORROW`, `WITHDRAW`, and `TRANSFER` all have
  real behavior today. `LIQUIDATE` has a policy branch in the repo (see
  below), but it isn't deployed and has no consumer adapter yet.
  `INCREASE_LEVERAGE` exists in the enum only.
- **`amount`** — the amount the caller wants to execute, as an
  18-decimal fixed-point internal unit, regardless of any real token's
  actual decimals. This convention is enforced by callers, not by
  Policy itself. **Exception: for `LIQUIDATE`, `amount` is the
  position's outstanding debt**, not an amount to execute (see below).

## Return value

```solidity
struct PolicyResponse {
    Decision decision;      // ALLOW | LIMIT | REVIEW | BLOCK
    uint256 permittedAmount;
    bytes32 reason;
}
```

- **`ALLOW`** — the request, on its own, does not exceed what
  CortexRails permits.
- **`LIMIT`** — the request exceeds `permittedAmount`. This is a
  reject-and-resubmit signal, not a clamp: CortexRails never silently
  reduces a request to fit. A calling contract that receives `LIMIT`
  and proceeds anyway is going out of its way to ignore the decision.
- **`REVIEW`** — reserved for a future manual-review path. No code
  path in `canExecute` returns it today; it exists in the enum (and in
  the frontend's decision-color mapping) purely so a future trigger
  doesn't need new UI/consumer branching to render correctly.
- **`BLOCK`** — the action is not permitted at all right now;
  `permittedAmount` is always `0`.
- **`permittedAmount`** is a ceiling, never a reduced version of the
  caller's request. **Callers must check `requestedAmount <=
  permittedAmount` themselves** and must account for their own
  existing state (e.g. debt) themselves — Policy does not know about
  either. This is stated explicitly in `ILedgerLinePolicy`'s NatSpec
  and is not incidental.
- **`reason`** is a machine-readable `bytes32` constant (`REASON_OK`,
  `REASON_EXCEEDS_CAPACITY`, `REASON_NO_CAPACITY`, `REASON_RESTRICTED`,
  `REASON_CORPORATE_ACTION`, `REASON_SUSPENDED`, `REASON_MATURING`,
  `REASON_REDEEMABLE`, `REASON_REDEEMED`), not a display string.

## Lifecycle short-circuit (applies to every action)

```solidity
if (asset.lifecycle != LifecycleState.ACTIVE) {
    return PolicyResponse({decision: BLOCK, permittedAmount: 0, reason: _lifecycleReason(asset.lifecycle)});
}
```

Any lifecycle state other than `ACTIVE` blocks *every* action
unconditionally, before capacity or position data is even read. This
is fuzz-tested across all 49 `(from, to)` lifecycle pairs and all
non-`ACTIVE` states × arbitrary amounts
(`testFuzz_nonActiveAlwaysBlocks`, `LedgerLineFuzz.t.sol`).

## BORROW behavior

If lifecycle is `ACTIVE`:

```
positionValue = PositionEngine.computePositionValue(rawBalance, price, multiplier)
capacity      = RiskEngine.computeBorrowingCapacity(positionValue, collateralFactorBps, riskAdjustmentBps)

capacity == 0        -> BLOCK,  permittedAmount = 0,        reason = NO_CAPACITY
amount <= capacity    -> ALLOW,  permittedAmount = capacity, reason = OK
amount >  capacity    -> LIMIT,  permittedAmount = capacity, reason = EXCEEDS_CAPACITY
```

**Important nuance:** the `amount` Policy compares against `capacity`
is only the newly-requested increment passed into this call — Policy
has no idea what the caller's existing debt is, because Registry
doesn't track debt at all (see `docs/ARCHITECTURE.md`'s state
ownership table). The consumer is responsible for combining Policy's
answer with its own state. `LedgerLineLendingAdapter.borrow()` does
exactly this:

```solidity
PolicyResponse memory response = policy.canExecute(assetId, positionId, Action.BORROW, amount);
if (response.decision == Decision.BLOCK) revert PolicyBlocked(response.reason);

uint256 wouldOweTotal = debt[msg.sender] + amount;
if (wouldOweTotal > response.permittedAmount) revert ExceedsPermittedAmount(wouldOweTotal, response.permittedAmount);
```

So a `LIMIT` decision from Policy alone doesn't necessarily mean the
adapter reverts, and an `ALLOW` from Policy alone doesn't guarantee the
adapter proceeds — the adapter's own debt-aware check is what actually
enforces "never exceed capacity across multiple borrows," and it is
covered by `testFuzz_successfulBorrowNeverExceedsCapacity` and the
full incremental-debt scenario in `LedgerLineDemo.t.sol::test_fullDemoFlow`
(borrow to the boundary, have capacity drop under existing debt, get
rejected, have it restored, borrow exactly up to the new boundary).
Any future consumer of Policy for a capacity-gated action must
replicate this debt-aware check itself; Policy will not do it for them.

## WITHDRAW behavior

```solidity
if (action == Action.WITHDRAW) {
    return PolicyResponse({decision: ALLOW, permittedAmount: position.rawBalance, reason: REASON_OK});
}
```

Once lifecycle is confirmed `ACTIVE`, a withdraw request is **always**
`ALLOW`ed up to the caller's full recorded position — capacity,
collateral factor, and risk adjustment are never consulted for this
action. This is deliberate, not a missing check: redeeming
already-deposited collateral has no natural relationship to borrowing
capacity, and `LedgerLineVaultAdapter.withdraw()`'s own comment states
this outright. It is directly tested:
`LedgerLineVaultAdapter.t.sol::test_withdrawIgnoresCapacityEntirely`
withdraws an amount that would be "over capacity" if the action were
borrow-gated, and confirms it still succeeds.

One consequence worth stating plainly (see also `docs/SECURITY.md`):
**`Policy.canExecute` itself does not check outstanding debt for
WITHDRAW** — `Policy` never reads `LendingAdapter.debt` for any
action, by design (see the BORROW section above). This was true
without qualification through Phase 10, but is no longer the full
picture: as of commit `9fa2c38`, `LedgerLineVaultAdapter.withdraw()`
adds its **own** separate debt-safety check on top of Policy's
lifecycle-only `ALLOW` — after receiving a non-`BLOCK` decision, it
reads `LendingAdapter.debt(msg.sender)` directly and, if any debt
exists, recomputes the position's remaining borrowing capacity after
the withdrawal and reverts with `WouldUnderCollateralizeDebt` if that
remaining capacity would fall below the existing debt. A withdrawal
that leaves enough capacity to still cover existing debt still
succeeds; one that wouldn't now reverts. This is the real, current,
bounded scope of the three-consumer proof — `Policy` itself stays
debt-agnostic for every action, exactly as designed, while the
individual consumer that has legitimate visibility into both position
and cross-contract debt (`VaultAdapter`) enforces the additional
safety property itself. Tested directly:
`LedgerLineVaultAdapter.t.sol::test_withdrawBlockedIfWouldUnderCollateralizeDebt`
and `test_withdrawAllowedIfDebtStillCovered`.

## TRANSFER behavior

```solidity
if (action == Action.TRANSFER) {
    return PolicyResponse({decision: ALLOW, permittedAmount: position.rawBalance, reason: REASON_OK});
}
```

Structurally identical to the WITHDRAW branch above: once lifecycle is
confirmed `ACTIVE`, a transfer request is **always** `ALLOW`ed up to
the caller's full recorded position, with capacity, collateral
factor, and risk adjustment never consulted — reassigning which
`positionId` owns a `rawBalance` is, like redeeming it, a pure
lifecycle question rather than a capacity one. `Policy` itself
similarly stays debt-agnostic for this action.

The debt rule enforced outside `Policy`, by `LedgerLineTransferAdapter`
itself, is **stricter** than `VaultAdapter`'s: rather than recomputing
whether *remaining* capacity would still cover existing debt,
`TransferAdapter.transfer()` reads `LendingAdapter.debt(msg.sender)`
and reverts with `OutstandingDebtBlocksTransfer` if that debt is
anything above zero at all, regardless of the amount requested or the
position's actual size. Reasoning: a withdrawal leaves the same owner
holding both the reduced collateral and the debt, so a remaining-
capacity check is meaningful; a transfer hands the collateral to a
*different* owner entirely, so whatever LTV math applied to the
original owner's debt no longer means anything once that collateral
changes hands — there is nothing to recompute. Tested directly:
`LedgerLineTransferAdapter.t.sol::test_transferBlockedWithAnyOutstandingDebt`
(even $1 of debt blocks any transfer amount) and
`test_transferAllowedWithZeroDebt`.

## LIQUIDATE behavior (implemented, tested, and deployed since V3/V4)

```solidity
if (action == Action.LIQUIDATE) {
    uint256 value = positionEngine.computePositionValue(position.rawBalance, asset.price, asset.multiplier);
    if (riskEngine.isLiquidatable(value, asset.collateralFactorBps, amount)) {
        return PolicyResponse({decision: ALLOW, permittedAmount: amount, reason: REASON_OK});
    }
    return PolicyResponse({decision: BLOCK, permittedAmount: 0, reason: REASON_ABOVE_MAINTENANCE});
}
```

Asks whether a position is under-collateralized. Liquidation eligibility
depends on debt, but `Policy` stays debt-agnostic: debt lives in the
lending market, never in Registry. So for this action only, **`amount`
is the position's outstanding debt**, supplied by the caller.
`LedgerLineLiquidationAdapter` (deployed since V4, `docs/DEPLOYMENTS.md`)
is that caller: it passes `lendingAdapter.debt(user)`, the same trust
pattern BORROW already relies on for cumulative debt, and never a
caller-supplied figure it can't verify.

The maths lives in the Stylus `RiskEngine`
(`stylus/risk-engine/src/lib.rs`):

- `computeLiquidationThreshold(value, collateralFactorBps)` =
  `value × collateralFactorBps / 10000`. This is the **maintenance
  margin**, and it deliberately leaves out the risk adjustment.
- `isLiquidatable(value, collateralFactorBps, debt)` = `debt > threshold`.
  Strictly greater: debt exactly at the threshold is **not** liquidatable.

Borrowing capacity (the initial margin) is `value × CF × risk
adjustment`, so the maintenance threshold is always at or above it.
A position borrowed to full capacity is never immediately liquidatable,
and the risk adjustment is the buffer between the two. At the testnet
configuration (70% CF, 80% risk adjustment) you can borrow up to 56%
loan-to-value and become liquidatable above 70%.

The lifecycle short-circuit still applies first, so a non-`ACTIVE`
asset blocks liquidation too. Zero debt is never liquidatable.

**Status:** live. The deployed `LedgerLinePolicy`
(`0xD6ECf112af596E82DEb2EEb9e989eE6B093D5460`, unchanged since V3) and
Stylus `RiskEngine` contain this branch, and `LedgerLineLiquidationAdapter`
(deployed V4) is the real, permissionless consumer that calls it and
acts on `ALLOW`. This section previously said "code and tests only" —
that described the V1/V2 state, before the V3 Policy redeploy added
this branch and the V4 LiquidationAdapter gave it a real caller. Tests:
`contracts/test/LedgerLineLiquidate.t.sol` (above, below, and exactly at
the boundary; non-ACTIVE; a real full-capacity borrow that becomes
liquidatable after a price drop; BORROW, WITHDRAW, and TRANSFER
decisions unchanged), `contracts/test/LedgerLineLiquidationAdapter.t.sol`
(the adapter itself, 10 tests), and the `RiskEngine` unit tests and
proptests.

## Why BORROW, WITHDRAW, and TRANSFER are different policies

They're different economic questions answered by the same function:
BORROW asks "how much *new* value can this position responsibly
support," which depends on price, collateral factor, and risk
adjustment; WITHDRAW and TRANSFER both ask "is this asset in a state
where acting on your own already-recorded balance is currently
permitted," which is a pure lifecycle question — they differ from each
other only in what happens *outside* `Policy`, in the consumer's own
additional debt-safety check. Proving `canExecute()` genuinely
branches between these — rather than every consumer independently
reimplementing "is this allowed" — is precisely what Phase 10
(`LedgerLineVaultAdapter`) and Phase 11 (`LedgerLineTransferAdapter`)
were built to demonstrate.

## Tests proving all three consumers share the same policy core

- `LedgerLineVaultAdapter.t.sol::test_borrowBehaviorCompletelyUnchanged`,
  `LedgerLineTransferAdapter.t.sol::test_borrowBehaviorCompletelyUnchanged`
  — adding the WITHDRAW branch, then the TRANSFER branch, didn't alter
  BORROW's behavior at all.
- `LedgerLineTransferAdapter.t.sol::test_withdrawBehaviorCompletelyUnchanged`
  — adding TRANSFER didn't alter WITHDRAW's behavior either.
- `LedgerLineVaultAdapter.t.sol::test_withdrawIgnoresCapacityEntirely`
  — WITHDRAW is genuinely not capacity-gated.
- `LedgerLineVaultAdapter.t.sol::test_withdrawBlockedWhenNonActive`,
  `LedgerLineTransferAdapter.t.sol::test_transferBlockedWhenNonActive` —
  the same lifecycle short-circuit applies to all three actions through
  the same `canExecute` code path.
- `LedgerLineVaultAdapter.t.sol::test_withdrawBlockedIfWouldUnderCollateralizeDebt`,
  `test_withdrawAllowedIfDebtStillCovered` — VaultAdapter's own
  remaining-capacity debt check, layered on top of Policy's
  lifecycle-only ALLOW.
- `LedgerLineTransferAdapter.t.sol::test_transferBlockedWithAnyOutstandingDebt`,
  `test_transferAllowedWithZeroDebt` — TransferAdapter's own, stricter
  any-debt-blocks-it-all check, layered the same way.
- `LedgerLineDemo.t.sol::test_fullDemoFlow` — full BORROW lifecycle
  (ALLOW → LIMIT as risk parameters tighten → BLOCK on lifecycle change
  → ALLOW again), against the real `LedgerLineRegistry`/`LedgerLinePolicy`.
- `LedgerLineFuzz.t.sol` — the lifecycle transition table, non-ACTIVE
  always-blocks, zero-price-never-allows-capacity, and
  never-exceeds-capacity properties, all against the real contracts.

## Agent-facing intent wrappers

`sdk/src/agent.ts`'s `evaluateAgentIntent` and `frontend/lib/agentIntent.ts`
exist purely as intent-translation convenience over this exact
`canExecute()` -- resolving a human-readable asset symbol/action/amount
into the real onchain call and decoding the response back to human units.
Neither has any independent decision logic: no capacity math, no
alternate lifecycle rule, no second reason vocabulary. See
`docs/ARCHITECTURE.md`'s "Agent-facing intent layer" section for the full
picture; this note exists here so nobody reading this file mistakes those
wrappers for a second policy engine.
