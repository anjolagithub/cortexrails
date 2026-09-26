# Demo Walkthrough

A judge-facing walkthrough of seven core flows, run against the
frontend's Policy Console (`/app`), its agent-intent demo section, and
Activity log (`/app/activity`). **Current live deployment is V4**
(`docs/DEPLOYMENTS.md`) — contract addresses below are updated to
match it.

> **Status of the hashes below:** Deposit, ALLOW borrow, and Vault
> withdrawal each have a real transaction hash from actually
> performing that action through the live frontend with a real
> wallet — none are fabricated. **They were recorded against the V2
> instances of these contracts, before the V3/V4 redeploys.** They
> remain real, honest proof that these exact flows worked live; they
> are not hashes against the current V4 addresses, because
> `LendingAdapter`/`VaultAdapter`/`TransferAdapter` were redeployed
> twice since (to add `repay()`/LIQUIDATE, then the `liquidate()`
> function) and a fresh position has not yet been rebuilt from scratch
> against V4 through the live UI. Recording the demo video against the
> current V4 deployment replaces this note with real V4 hashes. The
> LIMIT borrow step and the Transfer debt-safety step have **no hash
> at all, by design**, not because they're still pending: see each
> section for why. No successful (non-blocked) Transfer hash exists
> yet either — stated plainly below rather than filled with a
> placeholder.

Every hash links to Robinhood Chain testnet's explorer:
`https://explorer.testnet.chain.robinhood.com/tx/<hash>`.

## Prerequisites

- A wallet connected to Robinhood Chain testnet (chain ID 46630) with
  a small ETH balance for gas.
- A real TSLA balance (the live collateral token,
  `0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E`).
- The current `LedgerLineLendingAdapter`
  (`0x5e559ADeb6B69E7c6f26c0aE51071a162Aa6560d`, V4) needs to already
  hold real USDG liquidity to pay out borrows — funded once from the
  Paxos testnet faucet per `docs/INTEGRATIONS.md` (12 USDG as of the
  V4 funding tx in `docs/DEPLOYMENTS.md`, enough for one full
  borrow/repay/liquidate demo cycle, not a large pool).

## 1. TSLA deposit

On the Policy Console, enter an amount of TSLA in the Deposit form and
approve, then deposit. This is a real `safeTransferFrom` of TSLA into
`LedgerLineLendingAdapter`, followed by `Registry.setPosition`
recording the new raw balance. The `Deposited` event appears
immediately in the Activity log.

- Explorer: `https://explorer.testnet.chain.robinhood.com/tx/0x271b0e52fc14b757e0b22259caea2ec2cf4dc3db365fc98fa7af009ad687f8fe`

## 2. ALLOW borrow

With a deposited position, request a USDG amount within the position's
effective capacity (Position Value × 70% collateral factor × 80% risk
adjustment, shown live in the Policy Evaluation panel). `canExecute`
returns `ALLOW`; `LendingAdapter.borrow()` succeeds, `debt` is updated,
and real USDG (6-decimal, correctly scaled from the 18-decimal
request — see `docs/INTEGRATIONS.md`) is transferred to the wallet.
The `Borrowed` event appears in the Activity log.

- Explorer: `https://explorer.testnet.chain.robinhood.com/tx/0xf0b1e5553f58d6ba1cfe6782d4b386a76e0d54167e5ae6dbb7cb9dbb7127540c`

## 3. LIMIT / reverted borrow

Request a USDG amount that exceeds the position's effective capacity.
`canExecute` returns `LIMIT` — CortexRails never silently clamps a
request — and the Policy Console shows the verdict and the actual
maximum permitted amount before you'd even submit a transaction.

**No hash exists for this step, by design, not because it's pending.**
`BorrowForm` disables the submit button entirely whenever the
evaluated decision isn't `ALLOW` (it reads "Preview only -- adjust
amount"), so through the actual live frontend this request never
reaches `writeContract` at all — it is never signed, never submitted,
and never broadcast. (A raw, direct `LendingAdapter.borrow()` call
bypassing the frontend would still revert with `ExceedsPermittedAmount`
and would get a real, minable hash showing "Failed" on the explorer —
but that is not what this judge-facing walkthrough demonstrates.) As
`frontend/lib/activity.ts` notes explicitly, a reverted transaction
would leave no onchain event either way — the Activity log correctly
shows nothing for this step, which is itself the point.

## 4. Vault withdrawal

On the same position, withdraw TSLA via the Withdraw form. This calls
`LedgerLineVaultAdapter.withdraw()`, which makes its own independent
`canExecute(..., Action.WITHDRAW, ...)` call — evaluated purely on
lifecycle state (`ACTIVE`), not borrowing capacity, per
`docs/POLICY.md` — and on `ALLOW` calls
`LendingAdapter.releaseCollateral()` to transfer TSLA back to the
wallet and update the shared Registry position. The `Withdrawn` event
appears in the Activity log.

The live VaultAdapter is the debt-safe, V4 instance
(`0x4E94e5AdB0b03Be4E9d7336Da7f847E4E4BA9C43`). It also reverts with
`WouldUnderCollateralizeDebt` if the withdrawal would leave outstanding
USDG debt uncovered by the remaining position's capacity. Its deploy
and authorization txs are in `docs/DEPLOYMENTS.md`.

The hash below is a real `withdraw(1 TSLA)` through the pre-V4
debt-safe instance (`ALLOW`, block 123634239) — see the status note at
the top of this document regarding V2 vs. V4 hashes.

- Explorer: `https://explorer.testnet.chain.robinhood.com/tx/0xf7483471e5b898c7ad71b41f328b12d521c36c3d710189257c49e8aa9c7301db`

## 5. Transfer blocked by outstanding debt

With an outstanding USDG debt on the position (from step 2), attempt
a `TransferAdapter.transfer(to, amount)` (V4 instance:
`0x32D47195108fE08aA518D9779689F83E2154D4f1`) for any amount. Per
`docs/POLICY.md`/`docs/SECURITY.md`, `Action.TRANSFER` is
lifecycle-gated only through `canExecute` — same as WITHDRAW — but
`TransferAdapter` itself independently checks
`LendingAdapter.debt(msg.sender)` and blocks the transfer outright if
that debt is anything above zero, regardless of the amount requested
or the position's actual size. This is a stricter rule than
`VaultAdapter`'s (which only requires *remaining* capacity to still
cover debt): collateral changing owners invalidates whatever LTV math
applied to the original owner's debt, so there is nothing to
recompute.

Confirmed live two ways:

- **Direct `cast send`** against `TransferAdapter` from an account
  carrying $22 of outstanding debt reverted with
  `OutstandingDebtBlocksTransfer(22000000000000000000)` — correctly
  blocked.
- **Live UI**: the Transfer panel on the Policy Console showed
  "Outstanding debt blocks transfer -- repay first" and the submit
  button was disabled, matching `TransferAdapter.sol`'s check exactly
  (see `frontend/components/TransferForm.tsx`).

**No hash exists for this step, by design** — same reasoning as step
3: a call that reverts is never actually broadcast (a `cast send`
against a call Foundry/the RPC estimates will revert fails at gas
estimation and never gets mined; the live UI's disabled submit button
prevents `writeContract` from ever being called at all). **No
successful (non-blocked) transfer hash exists yet either** — that
would require a wallet with zero debt actually performing a transfer,
which hasn't been done through the live frontend as of this writing.
Stated here plainly rather than filled with a fabricated hash.

- Explorer: n/a — no transaction was ever broadcast for this step.

## 6. Agent-facing intent demo (LIMIT → retry → ALLOW → execution)

On the Policy Console (`/app`), the "Agent Intent → Policy → Execution"
section below the main console demonstrates the same flow an autonomous
agent would drive, using `frontend/lib/agentIntent.ts`'s
`evaluateAgentIntent` -- a thin wrapper that resolves a structured intent
(`{ asset: "TSLA", positionId, action: "BORROW", amount, assetOut: "USDG" }`)
into the exact same `LedgerLinePolicy.canExecute()` read the Policy
Console's own Borrow panel uses, then decodes the response back to human
units. No capacity math happens in this wrapper; the decision, permitted
amount, and reason are the real onchain answer.

Flow demonstrated:

1. **"Offchain agent intent"** — enter an amount exceeding the position's
   effective capacity (e.g. `120000` against $112,000 capacity) and click
   "Submit Intent." This panel is explicitly captioned "not yet read from
   chain" — nothing here is a chain read yet.
2. **"Live onchain policy result"** — the real `canExecute()` call
   returns `LIMIT`, `permittedAmount = 112000`, and the real `reason`
   constant `EXCEEDS_CAPACITY` (not the shorthand `CAPACITY_EXCEEDED`
   sometimes used in prose — the actual `bytes32` constant is kept
   verbatim, decoded to utf8, never remapped).
3. **Retry** — clicking "Retry with permitted amount ($112000)" sets the
   amount and performs a **fresh** `evaluateAgentIntent` call (never
   assumes the earlier result) against the exact same live contract.
4. **"Live onchain execution"** — now that a fresh evaluation returned
   `ALLOW`, the Execute button appears, reusing the same
   `useTransactionFlow`/`TransactionStatus` wallet-connected write flow
   every other action in this app uses. No hash is shown, and nothing is
   labeled a live onchain result, until `LendingAdapter.borrow()` is
   actually signed, submitted, and confirmed.

**No hash from this specific flow is recorded here** — same reasoning as
steps 3 and 5: this document only records hashes from actions actually
performed once, live, through the real frontend; the underlying
`borrow()` call this demo executes is the identical one already recorded
in step 2's hash above when a wallet runs this flow to a real `ALLOW`.

**Manual verification step (not automated — see `sdk/test/agent.test.ts`
for the automated unit coverage, which uses a stub client, not live
RPC):** before recording or running this demo live, run
`evaluateAgentIntent` once against the real deployment for an
over-capacity BORROW and confirm its `decision`/`permittedAmount`/`reason`
match a direct `LedgerLineClient.canExecute()` call for the same inputs.
This is a one-time sanity check that the wrapper's translation logic
hasn't drifted from the real contract, not a routine gate.

- Explorer: n/a for the evaluation reads (they are `eth_call`s, not
  transactions); the execution step's hash, once performed, is the same
  kind of `Borrowed` event already covered in step 2 and the Activity log.

## 7. LIQUIDATE (permissionless, via LedgerLineLiquidationAdapter)

On the Policy Console, the Liquidate panel (below the Borrow/Withdraw/
Transfer grid) takes a borrower address, then reads that borrower's
real debt from `LedgerLineLendingAdapter.debt()` and their real
position from `Registry`, and calls
`LedgerLinePolicy.canExecute(assetId, positionId, Action.LIQUIDATE,
debt)` -- the exact same read `LedgerLineLiquidationAdapter`
(`0xB24Af6a1bAfAB462DAa4776C0bc884Ce70B3a97d`) performs onchain before
acting. Unlike BORROW, this decision is strictly binary: `ALLOW` or
`BLOCK`, never `LIMIT` -- `LedgerLinePolicy`'s LIQUIDATE branch has no
partial-permission case (`docs/POLICY.md`).

Flow demonstrated:

1. Enter a borrower address with an active position and outstanding
   debt. The panel shows debt, position value, and the maintenance
   threshold (`positionValue x collateralFactorBps`), and the live
   `ALLOW`/`BLOCK` verdict -- `BLOCK` if debt is at or below threshold,
   `ALLOW` only if debt is strictly above it.
2. On `ALLOW`, enter a repay amount (in USDG) and a seize amount (in
   TSLA). The UI validates neither exceeds the real debt or position
   size before enabling submission.
3. **Approve USDG** -- a `safeTransferFrom`-enabling approval from the
   liquidator's wallet to `LendingAdapter`, sized to the exact
   6-decimal USDG amount the repay will pull (rounded up the same way
   the contract does, `toTokenAmountRoundUp` in
   `frontend/lib/contracts.ts`).
4. **Liquidate** -- calls `LedgerLineLiquidationAdapter.liquidate(
   borrower, repayAmount, seizeAmount)`. Onchain, this re-derives the
   borrower's live debt itself (never trusts a caller-supplied figure),
   re-checks `canExecute()`, and on `ALLOW` calls
   `LendingAdapter.liquidate()`, which reduces the borrower's debt,
   reduces their Registry position, pulls USDG from the liquidator, and
   pays out TSLA to the liquidator. The `Liquidated` event appears in
   the Activity log with both the borrower and liquidator addresses.

This is genuinely permissionless -- any wallet can be the liquidator,
not just the position owner or an authorized operator, matching
`test_anyoneCanLiquidate_permissionless` in
`contracts/test/LedgerLineLiquidationAdapter.t.sol`.

**No hash recorded here yet** -- same standard as the rest of this
document: only hashes from actions actually performed once, live,
through the real frontend get recorded, never a fabricated one.
Recording the demo video is the moment to fill this in with a real
liquidation tx.

- Explorer: n/a -- no liquidation has been performed through the live
  frontend as of this writing.

## Verifying independently

Every contract address referenced above is listed in
`docs/DEPLOYMENTS.md`. Any transaction hash placed into this document
can be independently checked against
`https://explorer.testnet.chain.robinhood.com/tx/<hash>`, and the
`/app/activity` page reads the same events directly from these
contracts' logs — it does not maintain its own separate record.
