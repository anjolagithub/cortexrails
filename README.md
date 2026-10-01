# CortexRails Protocol

## Liquidations shouldn't be a guess.

When a lending protocol can't prove that seizing collateral is
actually safe, it either freezes trading or gets drained by bad debt.
CortexRails is the deterministic onchain policy layer that answers
that question the same way, every time: financial protocols and
autonomous agents call CortexRails before executing an action, and
receive a deterministic **ALLOW**, **LIMIT**, **REVIEW**, or **BLOCK**
decision based on asset state, position risk, lifecycle conditions,
and action-specific rules.

**Agents propose. CortexRails decides. Adapters execute.**

Deployed on Robinhood Chain testnet against the real TSLA Stock Token
and USDG. Built for the Arbitrum Open House Singapore online
buildathon.

> **Note for judges:** this repo is `github.com/anjolagithub/cortexrails`.
> The Solidity contracts, tests, and SDK keep their original
> `LedgerLine` technical names -- that's the same project as
> **CortexRails Protocol**, just under its pre-rebrand engineering
> name. See [Naming](#naming) for why nothing onchain was renamed.

## Why CortexRails

Every protocol that lets users borrow, withdraw, or move a
tokenized-asset position ends up writing its own risk logic inline,
inside the contract that also custodies funds. That logic is hard to
audit in isolation, can't be reused by a second product without
copy-pasting it, and is easy to get subtly wrong. This gets worse once
the asset has a lifecycle (corporate actions, suspensions, redemptions)
that a plain ERC-20 balance can't express.

CortexRails separates two questions that financial applications
usually mix together:

1. **Policy decision.** Is this action permitted right now, and up to
   what amount?
2. **Financial execution.** Custody the funds, update the books, move
   the tokens.

The decision lives in one reusable place. Consuming contracts (and the
agents that propose actions to them) enforce it and hold the funds.

## Who this is for

- **A team building a lending, vault, or transfer product on tokenized
  real-world assets** who doesn't want to write and audit their own
  risk/lifecycle logic from scratch, or wants it shared across more
  than one product instead of copy-pasted per contract -- this repo's
  own four adapters (see [Multiple consumers](#multiple-consumers)
  below) are the proof that split works, not just a claim that it
  does.
- **An autonomous agent, or an agent framework, that needs to move
  funds** and wants a deterministic onchain boundary it checks before
  acting, instead of trusting its own judgment about what's safe (see
  [Autonomous agents](#autonomous-agents)).
- **Anyone extending the same Registry/Policy to a new action,** the
  way this repo added WITHDRAW, TRANSFER, and LIQUIDATE on top of
  BORROW without touching the state store or the Stylus engines.

No external protocol integrates CortexRails yet -- that's the real,
disclosed gap (see [Roadmap](#roadmap)), not something this section
is claiming otherwise.

## How it works

```
Agent / Protocol
      │  intent: { asset, positionId, action, amount }
      ▼
CortexRails  ── LedgerLinePolicy.canExecute()
      │          reads Registry state, calls Stylus PositionEngine + RiskEngine
      ▼
Decision     ── ALLOW / LIMIT / REVIEW / BLOCK, permittedAmount, reason
      ▼
Adapter      ── re-calls canExecute() in the same transaction, applies its own
      │          debt checks, then executes
      ▼
Execution    ── borrow / withdraw / transfer
```

## The policy primitive

```solidity
// contracts/src/interfaces/ILedgerLinePolicy.sol
function canExecute(
    uint256 assetId,
    uint256 positionId,
    Action action,
    uint256 amount
) external view returns (PolicyResponse memory response);

// contracts/src/interfaces/LedgerLineTypes.sol
struct PolicyResponse {
    Decision decision;        // ALLOW | LIMIT | REVIEW | BLOCK
    uint256 permittedAmount;  // the maximum permitted, never the request echoed back
    bytes32 reason;           // "OK", "EXCEEDS_CAPACITY", "NO_CAPACITY", "RESTRICTED", ...
}
```

`LedgerLinePolicy.canExecute` reads asset and position state from
`LedgerLineRegistry` (the single state store). It computes position
value and borrowing capacity through two stateless Arbitrum Stylus
(Rust/WASM) contracts, `PositionEngine` and `RiskEngine`, and returns a
decision. It is a `view` function: it never moves funds and never
enforces anything itself. That is the calling contract's job.

**Decision semantics** (exact rules in [`docs/POLICY.md`](docs/POLICY.md)):

| Decision | When | `permittedAmount` |
|---|---|---|
| `BLOCK` | Asset lifecycle is anything other than `ACTIVE` (reason = the state name), or computed capacity is zero (`NO_CAPACITY`) | `0` |
| `LIMIT` | BORROW request exceeds capacity (`EXCEEDS_CAPACITY`) | capacity |
| `ALLOW` | Request is within capacity (BORROW), or lifecycle is `ACTIVE` (WITHDRAW / TRANSFER) | capacity (BORROW) or full position (WITHDRAW / TRANSFER) |
| `REVIEW` | Reserved in the `Decision` enum for a manual-review path. **No branch returns it today.** | n/a |

LIMIT never quietly reduces the caller's request. It returns the
maximum permitted amount, and the caller decides whether to resubmit.

## Multiple consumers

The same, unmodified Registry, Stylus engines, and Policy back three
independent consumer contracts:

| Action | Consumer | What `canExecute()` checks | What the adapter adds |
|---|---|---|---|
| **BORROW** | `LedgerLineLendingAdapter` | Lifecycle `ACTIVE`; request vs. capacity = position value × collateral factor × risk adjustment | Existing debt + request ≤ `permittedAmount` (Policy is debt-agnostic) |
| **WITHDRAW** | `LedgerLineVaultAdapter` | Lifecycle `ACTIVE`; permitted up to the full position | Remaining capacity must still cover outstanding debt |
| **TRANSFER** | `LedgerLineTransferAdapter` | Lifecycle `ACTIVE`; permitted up to the full position | Any outstanding debt blocks the transfer outright. No tokens move; Registry ownership is reassigned in custody |

Adding WITHDRAW and then TRANSFER needed **zero changes** to
`LedgerLineRegistry` or either Stylus engine, and one new per-action
branch in `LedgerLinePolicy` each time. The test suites
(`LedgerLineVaultAdapter.t.sol`, `LedgerLineTransferAdapter.t.sol`)
re-test the earlier consumers' behavior each time a new one was added.

## Autonomous agents

Agents propose. CortexRails decides. Adapters execute.

An autonomous agent can decide what it wants to do. A financial
protocol still needs a deterministic boundary that decides what it is
actually allowed to do. CortexRails is that boundary. It is **not** an
AI model, a chatbot, or a second risk engine.

`sdk/src/agent.ts` (`evaluateAgentIntent`, `suggestRetryIntent`)
resolves a structured intent (`{ asset, positionId, action, amount }`)
into the real `canExecute()` call and decodes the response to human
units. That is all it does. The decision, permitted amount, and reason
are the onchain answer, unmodified.

Example against a $200,000 TSLA position under the testnet
configuration (70% collateral factor, 80% risk adjustment, so $112,000
of capacity):

```
Agent:        BORROW 120000 USDG against TSLA
CortexRails:  LIMIT   permittedAmount 112000   reason EXCEEDS_CAPACITY
Agent:        BORROW 112000 (suggestRetryIntent)
CortexRails:  ALLOW   permittedAmount 112000   reason OK
Adapter:      LendingAdapter.borrow() re-checks policy + existing debt, transfers USDG
```

The frontend's `/app` Policy Console has a live "Agent Intent → Policy
→ Execution" section that runs this loop against the deployed Policy
with the connected wallet's real position (`docs/DEMO.md` step 6).

**`@ledgerline/core/agentkit`** wires the same `evaluateAgentIntent()`
call into a real [Coinbase AgentKit](https://github.com/coinbase/agentkit)
`ActionProvider` (`cortexRailsActionProvider()`), built against
AgentKit's actual published plugin interface. It sits downstream of
AgentKit's own wallet-level custody/signing controls: AgentKit decides
whether its wallet will sign at all, CortexRails decides whether this
specific RWA action should be attempted, refusing outright (no
transaction sent) on `BLOCK` or `REVIEW`. See `sdk/README.md`'s
"Coinbase AgentKit integration" section for what this has and hasn't
been verified against — its pre-check and transaction-building logic
has real test coverage; a live end-to-end run against an actual
AgentKit wallet/agent has not happened yet, for lack of an AgentKit
account in this environment.

## Live deployment

**Robinhood Chain testnet, chain ID 46630.** The current testnet
deployment demonstrates CortexRails against the real TSLA Stock Token
and USDG contracts, while policy state and reference pricing remain
operator-configured in the test environment.

| | |
|---|---|
| **Real / deployed** | Robinhood Chain testnet · real TSLA Stock Token (collateral) · real USDG (borrow asset, 6-decimal scaling) · Stylus PositionEngine and RiskEngine · Registry · Policy · Lending, Vault, Transfer, and Liquidation adapters · `canExecute()` computed live on every call · agent-intent SDK layer |
| **Operator-configured** | Registry reference price ($364.27) · lifecycle state · collateral factor (70%) and risk adjustment (80%) |
| **Not claimed** | Mainnet or production readiness · decentralized live equity pricing · automatic oracle-to-policy sync · support for every tokenized asset · third-party audit |

Explorer: <https://explorer.testnet.chain.robinhood.com>. All addresses
are listed [below](#deployment-addresses).

## Architecture

```
Asset adapter       RobinhoodStockTokenAdapter    (deployed; not yet wired into Registry)
      ↓
Registry / state    LedgerLineRegistry            (single state store; owner-set asset params)
      ↓
Position engine     PositionEngine  (Stylus)      position value = rawBalance × price × multiplier
      ↓
Risk engine         RiskEngine      (Stylus)      capacity = value × collateralFactor × riskAdjustment
      ↓
Policy              LedgerLinePolicy              canExecute() → decision
      ↓
Financial adapter   Lending / Vault / Transfer    custody, debt accounting, execution
```

The agent layer sits outside this deterministic core. Every amount
inside the core (debt, `amount`, `permittedAmount`) is an 18-decimal
internal unit. `LedgerLineLendingAdapter` scales to USDG's real 6
decimals only at the final transfer. See
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the contract graph,
the Solidity/Stylus boundary, and state ownership.

## Security / limitations

Full detail in [`docs/SECURITY.md`](docs/SECURITY.md). The ones that
matter most:

- **Operator-configured policy state.** Price, lifecycle, and risk
  parameters on the live Registry are set by the contract owner
  (`updateAssetParameters` / `transitionLifecycle`). No oracle pushes
  into Registry. `RobinhoodStockTokenAdapter` is deployed and can read
  TSLA data, but it is not wired into the live decision path, and no
  Chainlink tokenized-equity feed exists for Robinhood Chain testnet
  (details in [`docs/INTEGRATIONS.md`](docs/INTEGRATIONS.md)).
- **`repay()` and LIQUIDATE are both deployed and live** (V3/V4,
  `docs/DEPLOYMENTS.md`) via the current `LedgerLineLendingAdapter`
  and the permissionless `LedgerLineLiquidationAdapter`. The real,
  current limitation is that `debt` is per-instance state: every time
  `LendingAdapter` has been redeployed to ship a new function, the new
  instance's debt mapping starts at zero, and debt against a
  superseded instance is only repayable through that old contract.
  Also, whether a position is actually liquidatable still depends on
  the same owner-set Registry price as every other decision (see the
  oracle bullet above), not a live market feed.
- **Policy is debt-agnostic.** For BORROW, `canExecute()` compares only
  the new request to capacity. Consumers must add existing debt
  themselves, as `LedgerLineLendingAdapter` does.
- **No upgradeability, no audit.** Nothing here claims production
  readiness, audit coverage, or gas benchmarks.

## Developer integration

**Solidity.** Call `canExecute()` before acting, and enforce the result
yourself. From `LedgerLineLendingAdapter.borrow()`:

```solidity
PolicyResponse memory response = policy.canExecute(assetId, positionId, Action.BORROW, amount);
if (response.decision == Decision.BLOCK) revert PolicyBlocked(response.reason);
uint256 wouldOweTotal = debt[msg.sender] + amount;
if (wouldOweTotal > response.permittedAmount) revert ExceedsPermittedAmount(wouldOweTotal, response.permittedAmount);
```

**TypeScript.** `sdk/` is `@ledgerline/core`, a typed viem client over
Registry, Policy, and the four adapters (Lending, Vault, Transfer,
Liquidation). It defaults to the testnet addresses and is not yet
published to npm.

```ts
import { LedgerLineClient, Action, evaluateAgentIntent, suggestRetryIntent } from "@ledgerline/core";

const client = new LedgerLineClient({ rpcUrl: "https://rpc.testnet.chain.robinhood.com" });

// Direct policy read (amounts are 18-decimal internal units)
const positionId = LedgerLineClient.positionIdFromAddress(wallet);
const check = await client.canExecute(positionId, Action.BORROW, 120_000n * 10n ** 18n);

// Agent-facing intent (human-unit amounts)
const intent = { asset: "TSLA", positionId: wallet, action: "BORROW" as const, amount: "120000" };
const result = await evaluateAgentIntent(client, intent);
// result: { decision, requestedAmount, permittedAmount, reason, assetId, positionId, action, raw }
const retry = suggestRetryIntent(intent, result); // defined only when decision === "LIMIT"
```

See [`sdk/README.md`](sdk/README.md) and `sdk/src/client.ts` for the
full read/write surface and its amount and confirmation conventions.

## Deployment addresses

Robinhood Chain testnet (46630). Sourced from
`contracts/broadcast/*/46630/run-latest.json` and checked against live
chain state. Block numbers and deploy transactions are in
[`docs/DEPLOYMENTS.md`](docs/DEPLOYMENTS.md).

**Current (V4).** Full history, deploy transactions, and why each
contract cascaded are in [`docs/DEPLOYMENTS.md`](docs/DEPLOYMENTS.md).

| Contract | Role | Address |
|---|---|---|
| `LedgerLineRegistry` | State store | [`0x88508A6d9266fbc928cC11DEE92f4EB1801B907c`](https://explorer.testnet.chain.robinhood.com/address/0x88508A6d9266fbc928cC11DEE92f4EB1801B907c) |
| `LedgerLinePolicy` | `canExecute()` | [`0xD6ECf112af596E82DEb2EEb9e989eE6B093D5460`](https://explorer.testnet.chain.robinhood.com/address/0xD6ECf112af596E82DEb2EEb9e989eE6B093D5460) |
| `PositionEngine` (Stylus) | Position value | [`0xde8365dAF3CFdF952E2F946F19a4DcAcd57eFf0F`](https://explorer.testnet.chain.robinhood.com/address/0xde8365dAF3CFdF952E2F946F19a4DcAcd57eFf0F) |
| `RiskEngine` (Stylus) | Borrowing capacity, `isLiquidatable()` | [`0x10246f909139Aa83f7C223012bDd656472b3C2bc`](https://explorer.testnet.chain.robinhood.com/address/0x10246f909139Aa83f7C223012bDd656472b3C2bc) |
| `LedgerLineLendingAdapter` | BORROW/repay/deposit consumer, custody, `liquidate()` | [`0x5e559ADeb6B69E7c6f26c0aE51071a162Aa6560d`](https://explorer.testnet.chain.robinhood.com/address/0x5e559ADeb6B69E7c6f26c0aE51071a162Aa6560d) |
| `LedgerLineVaultAdapter` | WITHDRAW consumer (debt-safe) | [`0x4E94e5AdB0b03Be4E9d7336Da7f847E4E4BA9C43`](https://explorer.testnet.chain.robinhood.com/address/0x4E94e5AdB0b03Be4E9d7336Da7f847E4E4BA9C43) |
| `LedgerLineTransferAdapter` | TRANSFER consumer | [`0x32D47195108fE08aA518D9779689F83E2154D4f1`](https://explorer.testnet.chain.robinhood.com/address/0x32D47195108fE08aA518D9779689F83E2154D4f1) |
| `LedgerLineLiquidationAdapter` | LIQUIDATE consumer (permissionless) | [`0xB24Af6a1bAfAB462DAa4776C0bc884Ce70B3a97d`](https://explorer.testnet.chain.robinhood.com/address/0xB24Af6a1bAfAB462DAa4776C0bc884Ce70B3a97d) |
| `RobinhoodStockTokenAdapter` | Asset adapter (not wired into Registry) | [`0x3A1B5a91DBb68C39647B5a7Fe0aDD1a59Ec3dfb9`](https://explorer.testnet.chain.robinhood.com/address/0x3A1B5a91DBb68C39647B5a7Fe0aDD1a59Ec3dfb9) |
| TSLA Stock Token | Collateral, 18 decimals | [`0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E`](https://explorer.testnet.chain.robinhood.com/address/0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E) |
| USDG | Borrow asset, 6 decimals | [`0x7E955252E15c84f5768B83c41a71F9eba181802F`](https://explorer.testnet.chain.robinhood.com/address/0x7E955252E15c84f5768B83c41a71F9eba181802F) |

The Stylus engine addresses are read live from
`LedgerLinePolicy.positionEngine()` / `riskEngine()`; they were deployed
with `cargo stylus deploy` outside Foundry's broadcast mechanism.

## Tests

```bash
cd contracts && forge test                          # 66 tests: unit, fuzz, decimal scaling, adapter suites (incl. liquidation)
cd sdk && npm test                                  # 33 tests: agent-intent layer (stub client, no RPC)
cd stylus/position-engine && cargo test             # PositionEngine math
cd stylus/risk-engine && cargo test                 # RiskEngine math
cd frontend && npm run build                        # type-check + production build
```

## Real integration issues found during deployment

Each of these came up while wiring the project to real chains and real
tokens, and each is now regression-tested:

- **USDG's real decimals (6) don't match the internal 18-decimal
  convention.** An earlier version transferred the raw 18-decimal
  figure as if it were already in USDG's native units. Fixed by
  reading `IERC20Metadata.decimals()` once at construction and scaling
  only at the point of transfer (`LedgerLineDecimalScaling.t.sol`).
- **The real Stock Token contract doesn't implement `oraclePaused()`**
  the way Robinhood's own docs assume. The call reverts outright on
  the live testnet TSLA contract. `RobinhoodStockTokenAdapter` now
  calls it via `try/catch` and falls through to its mandatory
  staleness check on any failure, matching Robinhood's own documented
  caveat that the flag is advisory (`RobinhoodStockTokenAdapter.t.sol`).
- **No live Chainlink price feed exists for Robinhood Chain testnet at
  all** (Chainlink's tokenized-equity feeds are mainnet-only today),
  and no Chainlink L2 Sequencer Uptime Feed exists for this chain on
  any network. See [`docs/INTEGRATIONS.md`](docs/INTEGRATIONS.md).
- **The original `LedgerLineLendingAdapter` had no way to authorize a
  second consumer** to release custodied collateral. Retrofitting it
  wasn't possible without a storage-layout change, so the V2 testnet
  deployment redeploys the whole stack atomically instead. The old V1
  adapter is permanently abandoned with 1 TSLA stranded in it
  (disclosed in `docs/DEPLOYMENTS.md`).
- **`LedgerLineRegistry` didn't originally bound `collateralFactorBps`
  / `riskAdjustmentBps` to ≤ 100%**, which could let computed borrowing
  capacity exceed real position value. Fixed with an explicit revert
  and covered by fuzz testing.
- **A `forge script --broadcast` run whose later call reverts
  broadcasts nothing.** The VaultAdapter redeploy script's
  `setAuthorizedReleaser` call reverted in simulation (non-owner key),
  so the deploy never reached chain. Only the simulated address was
  printed, and it was later authorized by hand. Fixed by making the
  script deploy-only, deploying for real, authorizing the new instance,
  and revoking both the pre-fix and codeless authorizations, each step
  verified on chain (txs in `docs/DEPLOYMENTS.md`).

## Repo layout

- `contracts/`: Foundry project (Solidity). Registry, Policy,
  LendingAdapter, VaultAdapter, TransferAdapter, the Robinhood Stock
  Token adapter, interfaces, mocks, tests, and deployment scripts.
- `stylus/`: Rust/Arbitrum Stylus workspace (`position-engine`,
  `risk-engine`), the two stateless computation contracts Policy calls.
- `sdk/`: TypeScript SDK (`@ledgerline/core`), a typed viem client
  plus the agent-intent layer.
- `frontend/`: Next.js app. Landing page, Policy Console and agent demo
  (`/app`), and Activity log (`/app/activity`) against the live testnet
  deployment.
- `docs/`: architecture, policy, integration, security, deployment,
  and demo documentation.

## Roadmap

Natural next additions, given the current, disclosed scope boundaries.
(`repay()` and `Action.LIQUIDATE` used to be listed here as
"implemented, not deployed" -- both shipped in the V3/V4 redeploys,
`docs/DEPLOYMENTS.md`, and are live today, so they've moved off this
list.)

1. **Oracle-to-Registry sync.** `sdk/scripts/oracle-sync.ts` reads a
   mock price feed, not a real oracle, and by default only prints the
   lifecycle transition it would make. It sends a transaction only when
   you pass `--execute` with the Registry owner key and confirm
   interactively, and nothing runs it against the live Registry today.
   Next step is wiring this to a real feed the moment one exists for
   Robinhood Chain testnet (see the oracle bullet in
   [Security / limitations](#security--limitations)) and running it on
   a schedule instead of by hand.
2. **A consumer CortexRails didn't write itself.** All four current
   adapters (Lending, Vault, Transfer, Liquidation) are this repo's
   own. The real test of "reusable policy layer" is a second,
   independent protocol calling `canExecute()` against the same
   Registry/Policy without forking this code -- the SDK's
   agent-intent layer is built for exactly that entry point.
3. **More than one asset.** `assetId = 1` (TSLA) is the only
   configured asset today. Generalizing beyond it -- another
   tokenized equity, a different asset class entirely -- is what
   would actually demonstrate the Registry/Policy split isn't
   TSLA-specific, rather than just claiming it isn't.
4. **Audit and upgradeability path.** Explicitly out of scope for a
   buildathon submission (see [Not claimed](#live-deployment) above),
   but the real next milestone before any production claim: a
   third-party security review, and a considered answer to
   upgradeability that doesn't just add an admin key by default.

None of the above is built yet -- this section is deliberately kept
to what's next, not what's done; see [Live deployment](#live-deployment)
and [Security / limitations](#security--limitations) for what's
actually shipped and running today.

## Naming

The public product name is **CortexRails Protocol**, and this repo is
now named to match (`cortexrails`, previously `ledgerline-cor`). The
Solidity contracts, tests, deployment scripts, and the
`@ledgerline/core` SDK package still keep their original `LedgerLine`
technical name, because renaming a deployed or importable identifier
for branding alone would break real compatibility for no benefit. If
you're looking for the CortexRails Protocol submission and landed on
`LedgerLine` code, contracts, or addresses: **this is it, same
project.** Neither name is an established or trademarked product name.

## Further reading

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): contract graph, the
  Solidity/Stylus boundary, state ownership, the agent-facing layer.
- [`docs/POLICY.md`](docs/POLICY.md): exactly how `canExecute()`
  decides BORROW vs. WITHDRAW vs. TRANSFER, and why they differ.
- [`docs/INTEGRATIONS.md`](docs/INTEGRATIONS.md): the real Robinhood
  Chain, TSLA, and USDG integration details, and what's live vs.
  owner-configured.
- [`docs/SECURITY.md`](docs/SECURITY.md): trust assumptions, access
  control, and known limitations.
- [`docs/DEPLOYMENTS.md`](docs/DEPLOYMENTS.md): every deployed address
  on Robinhood Chain testnet, with block numbers and deploy txs.
- [`docs/DEMO.md`](docs/DEMO.md): a walkthrough of the core flows with
  real transaction hashes.
- [`docs/ANALYSIS.md`](docs/ANALYSIS.md): a reproducible historical
  backtest of the live risk formulas against 14+ years of real TSLA
  price data -- what would have happened to a full-capacity borrower,
  quantified, not asserted.
