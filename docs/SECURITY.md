# Security

This documents trust assumptions, access control, and known
limitations as they actually exist in `contracts/src/` today, based on
reading the contracts and their tests. **This is not an audit, does
not claim audit coverage, and does not claim any guarantee the code
doesn't actually enforce.** It extends and updates the Phase 6 review
(`../SECURITY.md`, still present at the repo root) through Phase 10
(`LedgerLineVaultAdapter`), the real Robinhood Chain / TSLA / USDG
integration, and the V3/V4 redeploys that added `repay()` and a real
LIQUIDATE consumer (`docs/DEPLOYMENTS.md`) — points 7 and 8 below
reflect that current state, not the pre-V3 state this document
originally described.

## Access control

| Contract | Privileged function | Gate |
|---|---|---|
| `LedgerLineRegistry` | `initializeAsset`, `updateAssetParameters`, `transitionLifecycle`, `setPositionWriter` | `onlyOwner` |
| `LedgerLineRegistry` | `setPosition` | `onlyPositionWriter` (a single address, itself only changeable by the owner) |
| `LedgerLineLendingAdapter` | `setAuthorizedReleaser` | `onlyOwner` |
| `LedgerLineLendingAdapter` | `releaseCollateral` | caller must be on `isAuthorizedReleaser` |
| `LedgerLinePolicy` | none — `registry`/`positionEngine`/`riskEngine` are set once in the constructor with no setter | n/a |
| `LedgerLineVaultAdapter` | none — no owner, no privileged functions at all | n/a |

No unauthorized state-mutation path was found in any of the four
Solidity contracts.

## Oracle / pricing assumptions

Price, multiplier, lifecycle, and risk parameters on the live Registry
are **entirely owner-controlled** — there is no live oracle push path
today (see `docs/INTEGRATIONS.md` for the full picture). This is the
single largest trust assumption in the system: whoever holds the
Registry owner key can set arbitrary prices, multipliers, and
lifecycle states, which flow directly into every `canExecute`
decision. This is disclosed, not hidden — `RobinhoodStockTokenAdapter`
exists specifically as the intended eventual replacement for
owner-set prices, but it is not wired into Registry today, and (see
below) is not currently even callable as deployed.

## Lifecycle enforcement

Transitions are validated against a fixed, hardcoded graph
(`LedgerLineRegistry._isValidTransition`) and gated `onlyOwner`.
Fuzz-tested against all 49 `(from, to)` pairs
(`testFuzz_lifecycleTransitionTableMatchesApprovedGraph`); only the 10
approved edges succeed. Every action is blocked unconditionally
whenever lifecycle isn't `ACTIVE`, checked first in `canExecute`
before any capacity computation
(`testFuzz_nonActiveAlwaysBlocks`).

## Price validation

`RobinhoodStockTokenAdapter.getAssetState` validates its price feed
input: rejects `answer <= 0`, rejects `updatedAt == 0`, and reverts on
staleness beyond a configured threshold (`InvalidPrice`, `StalePrice`;
tested in `RobinhoodStockTokenAdapter.t.sol`). **None of this
validation currently protects the live price path**, because Registry
never reads from this adapter (`docs/INTEGRATIONS.md`).
`Registry.updateAssetParameters`/`initializeAsset` themselves perform
no price validation at all beyond bounding the two bps fields — the
owner can set `price` to `0` or to any value. A `0` price safely
yields `0` position value and therefore `0` capacity
(`testFuzz_zeroPriceNeverAllowsCapacity` reverts any borrow attempt in
that state), but this is a consequence of the arithmetic, not an
explicit input check.

## Decimal handling

Internal accounting is always 18-decimal fixed-point; a real token's
actual decimals only matter at the literal transfer boundary in
`LedgerLineLendingAdapter`. A decimal-scaling bug here was real, found
during USDG integration, and fixed directly in the contract — see
`docs/INTEGRATIONS.md` and `LedgerLineDecimalScaling.t.sol`.

## Token-transfer assumptions

All transfers use OpenZeppelin's `SafeERC20`. `LendingAdapter.deposit()`
performs `safeTransferFrom` *before* updating Registry state — the one
deviation from strict checks-effects-interactions in this codebase.
This is only safe because the collateral token in the current
deployment (real TSLA) is a known, non-malicious, standard ERC-20; a
future integration with an arbitrary or untrusted token would need
this ordering revisited before being safe against reentrancy.
`borrow()` follows checks-effects-interactions correctly: `debt` is
updated before the external `safeTransfer` call.

## Known limitations (Phase 10, disclosed)

1. **`Policy.canExecute` for BORROW only sees the newly-requested
   amount, not cumulative debt.** The debt-aware check
   (`debt[msg.sender] + amount > permittedAmount`) lives only inside
   `LedgerLineLendingAdapter`. Any future capacity-gated consumer of
   `Policy` that doesn't replicate this check itself would under-protect
   its own callers — Policy will not do it for them (`docs/POLICY.md`).
2. **No live oracle.** Registry's price/lifecycle/risk parameters are
   entirely owner-set; a compromised or malicious owner key can set
   arbitrary values that flow straight into every policy decision.
3. **`Registry` bounds `collateralFactorBps`/`riskAdjustmentBps` to
   ≤ 10,000 (fixed and fuzz-tested this phase) but does not bound
   `price`** beyond the arithmetic consequence of a zero price yielding
   zero capacity — there is no sanity or deviation check on price
   updates.
4. **The V1 `LedgerLineLendingAdapter`
   (`0x598e3884657c8eF4870381E4c1Cc4e8e2D0dbcB7`) is permanently
   abandoned** with 1 real TSLA stranded in it — it predates
   authorized-releaser support and cannot be retrofitted without a
   storage-layout change, and none of these contracts are upgradeable
   by design (see `docs/DEPLOYMENTS.md`). The same is true of the
   pre-fix `RobinhoodStockTokenAdapter` instance
   (`0x9aE01a29Ec6774CAb63C6491F8f7D6b3866D1c2f`, superseded below), and
   of the pre-fix `LedgerLineVaultAdapter` instance
   (`0x5d27a9aC4bC4b63BE9939bD386c4f198B7308D67`, superseded below; its
   releaser authorization on `LendingAdapter` has been revoked).
5. **No upgradeability anywhere in the stack** (matches the project's
   own "avoid unnecessary upgradeability" rule) — there is no proxy
   pattern and no post-deployment swap path for any immutable contract
   reference, which is also why point 4 has no remediation short of a
   full redeploy.
6. **No professional audit has been performed on any part of this
   codebase.**
7. **`repay()` is deployed and live** (as of the V3 redeploy,
   `docs/DEPLOYMENTS.md`) — this point previously said the opposite;
   that was true of the V1/V2 `LedgerLineLendingAdapter` instances but
   is no longer true of the current one. The real, still-current
   limitation: `debt` is per-instance state. Every time
   `LedgerLineLendingAdapter` has been redeployed (V2→V3 to add
   `repay()`/LIQUIDATE, V3→V4 to add `liquidate()`), the new instance's
   `debt` mapping starts at zero for every position — any debt against
   a superseded instance is only repayable through that old, abandoned
   contract, it does not carry over. This is a real cost paid at every
   redeploy, disclosed in `docs/DEPLOYMENTS.md`'s "Known real cost"
   notes, not a hidden one.
8. **LIQUIDATE is deployed and live** via the permissionless
   `LedgerLineLiquidationAdapter` (`docs/DEPLOYMENTS.md`'s V4 section)
   — this document predates that adapter's existence, hence its
   absence above. The same oracle limitation as point 2 applies here
   too: whether a position is *actually* liquidatable still depends on
   the same owner-set Registry price as every other decision, not a
   live market feed. A real liquidation bot built on this adapter
   would need real price data wired into Registry before it could run
   unattended against real market conditions.

## Fixed since the last revision of this document

`VaultAdapter.withdraw()` previously did not check outstanding debt at
all — a user who had borrowed against their position could withdraw
the underlying collateral out from under that debt, because neither
`Policy` nor `VaultAdapter` ever read `LendingAdapter.debt`.
`Policy.canExecute()` deliberately stays debt-agnostic (`docs/POLICY.md`
explains why WITHDRAW is a pure lifecycle question in this codebase;
its own tests are unchanged). Commit `9fa2c38` closes the gap with a
separate check inside `VaultAdapter.withdraw()` itself — the one place
with legitimate visibility into both position and cross-contract
debt — which now reverts if a withdrawal would leave outstanding
`LendingAdapter` debt uncollateralized
(`test_withdrawBlockedIfWouldUnderCollateralizeDebt`,
`test_withdrawAllowedIfDebtStillCovered`). Because this changes
`VaultAdapter`'s bytecode, it needed a redeploy. The first attempt
silently failed: its script bundled an `onlyOwner` authorization run
with a non-owner key, so forge broadcast nothing, and a codeless address
(`0x0F705a7473461C1eF4148bC3D813E1ab15EC93ac`) ended up authorized as a
releaser while the pre-fix instance stayed live. As of 2026-09-24 the
debt-safe instance is deployed at
`0xfF7EC5218730AdbCAa14cdf205cc57F97D335A6b` and authorized, and both
the pre-fix instance and the codeless address have had their releaser
authorization revoked. The txs are in `docs/DEPLOYMENTS.md`. This does not change limitation 1 above
(`Policy.canExecute` for BORROW only sees the newly-requested amount) —
that remains a separate, unfixed gap.

`RobinhoodStockTokenAdapter.getAssetState()` previously reverted
unconditionally on the live deployment, because it called
`_checkSequencerUp()` unconditionally against a zero-address sequencer
feed (no real one exists for this chain). Commit `d1a289a` made
`sequencerCheckEnabled` an actual, working toggle (defaulting to
`false`, gating that call) — a first attempt at this fix had been
written into a deploy script's comments but never actually applied to
the contract itself; `git log -- contracts/src/RobinhoodStockTokenAdapter.sol`
confirmed no such change had ever landed before `d1a289a`. Verified
directly: constructing the adapter with the exact constructor
arguments from the new deployment
(`contracts/broadcast/RedeployStockAdapter.s.sol/46630/run-latest.json`)
and calling `getAssetState()` now returns a valid `AssetState` instead
of reverting. The redeployed instance's address is in
`docs/DEPLOYMENTS.md`. This does not change the fact that this
contract still isn't wired into the live Registry-read path
(`docs/INTEGRATIONS.md`) — it's now *usable*, not yet *used*.

## Not claimed

This document does not constitute a professional audit. No
performance or gas benchmarks are claimed anywhere in this codebase.
No broader claim is made that the two reference consumers, together,
form an exhaustively solvency-safe combined system beyond the specific
withdraw-side gap closed in "Fixed since the last revision" above —
each is independently correct against its own documented policy, which
is the narrower claim this project actually makes and tests for.
