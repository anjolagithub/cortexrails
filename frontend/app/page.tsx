import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";
import { LandingPolicyDemo } from "@/components/LandingPolicyDemo";

const REPO = "https://github.com/anjolagithub/cortexrails";
const EXPLORER = "https://explorer.testnet.chain.robinhood.com";

// Exact signature from contracts/src/interfaces/ILedgerLinePolicy.sol and
// the PolicyResponse struct from LedgerLineTypes.sol.
const canExecuteCode = `function canExecute(
    uint256 assetId,
    uint256 positionId,
    Action  action,     // BORROW | WITHDRAW | TRANSFER | ...
    uint256 amount      // 18-decimal internal units
) external view returns (PolicyResponse memory);

struct PolicyResponse {
    Decision decision;        // ALLOW | LIMIT | REVIEW | BLOCK
    uint256  permittedAmount; // the maximum permitted, never the request
    bytes32  reason;          // "OK", "EXCEEDS_CAPACITY", "RESTRICTED", ...
}`;

// Abridged from LedgerLineLendingAdapter.borrow().
const consumerCode = `PolicyResponse memory response =
    policy.canExecute(assetId, positionId, Action.BORROW, amount);

if (response.decision == Decision.BLOCK) revert PolicyBlocked(response.reason);

uint256 wouldOweTotal = debt[msg.sender] + amount;
if (wouldOweTotal > response.permittedAmount)
    revert ExceedsPermittedAmount(wouldOweTotal, response.permittedAmount);`;

// Real exports from sdk/src (agent.ts, client.ts).
const sdkCode = `import { LedgerLineClient, evaluateAgentIntent, suggestRetryIntent } from "@ledgerline/core";

const client = new LedgerLineClient({ rpcUrl }); // defaults to the testnet deployment

const intent = {
  asset: "TSLA",
  positionId: agentWallet,   // address or raw positionId
  action: "BORROW",          // "BORROW" | "WITHDRAW" | "TRANSFER"
  amount: "120000",          // human units; the SDK scales to 18 decimals
};

const result = await evaluateAgentIntent(client, intent);
// e.g. { decision: "LIMIT", permittedAmount: "112000", reason: "EXCEEDS_CAPACITY", raw, ... }

const retry = suggestRetryIntent(intent, result); // amount = permittedAmount, only on LIMIT`;

const heroFlow = [
  { label: "Agent / Protocol", detail: "proposes an action" },
  { label: "Intent", detail: "{ asset, positionId, action, amount }" },
  { label: "CortexRails", detail: "canExecute() · onchain policy", core: true },
  { label: "Decision", detail: "", decisions: true },
  { label: "Execution", detail: "consuming adapter enforces, then moves value" },
];

const consumers = [
  {
    action: "BORROW",
    contract: "LedgerLineLendingAdapter",
    text: "CortexRails evaluates borrowing capacity and risk before a lending action executes: position value × collateral factor × risk adjustment, computed by the Stylus engines.",
    policy: "Lifecycle must be ACTIVE · request compared to capacity",
    adapter: "Adapter enforces existing debt + request ≤ permitted amount",
  },
  {
    action: "WITHDRAW",
    contract: "LedgerLineVaultAdapter",
    text: "CortexRails evaluates lifecycle conditions before collateral leaves the vault. The adapter then applies debt safety: remaining capacity must still cover outstanding debt.",
    policy: "Lifecycle must be ACTIVE · permitted up to the full position",
    adapter: "Adapter blocks a withdrawal that would under-collateralize debt",
  },
  {
    action: "TRANSFER",
    contract: "LedgerLineTransferAdapter",
    text: "CortexRails evaluates lifecycle conditions before collateral changes owner. Ownership is reassigned in custody; no tokens move.",
    policy: "Lifecycle must be ACTIVE · permitted up to the full position",
    adapter: "Adapter blocks the transfer while any debt is outstanding",
  },
  {
    action: "LIQUIDATE",
    contract: "LedgerLineLiquidationAdapter",
    text: "CortexRails evaluates whether a position's real, live debt has crossed the Stylus RiskEngine's maintenance threshold. Policy stays debt-agnostic by design -- the adapter supplies the borrower's actual debt from LendingAdapter as the request amount.",
    policy: "Debt supplied by the adapter must exceed value × collateral factor",
    adapter: "Permissionless: any caller repays part of the debt and receives seized collateral in return",
  },
];

const decisions = [
  { name: "ALLOW", tone: "text-decision-allow", text: "The action satisfies policy." },
  { name: "LIMIT", tone: "text-decision-limit", text: "The requested amount exceeds the permitted amount. The response carries the maximum permitted." },
  { name: "REVIEW", tone: "text-decision-review", text: "Reserved in the Decision enum for a manual-review path. No policy branch returns it today.", reserved: true },
  { name: "BLOCK", tone: "text-decision-block", text: "The action violates policy, for example a non-ACTIVE lifecycle or zero capacity." },
];

const inputs = [
  { name: "ASSET", text: "Price and multiplier from the Registry, the single state store." },
  { name: "POSITION", text: "Raw collateral balance per (assetId, positionId)." },
  { name: "RISK", text: "Collateral factor and risk adjustment, each bounded to ≤ 100%." },
  { name: "LIFECYCLE", text: "ACTIVE · RESTRICTED · CORPORATE_ACTION · SUSPENDED · MATURING · REDEEMABLE · REDEEMED. Any state other than ACTIVE blocks every action with a state-specific reason." },
  { name: "ACTION", text: "BORROW, WITHDRAW, TRANSFER and LIQUIDATE all have real consumers. LedgerLineLiquidationAdapter derives a borrower's live debt from LendingAdapter, asks canExecute() with Action.LIQUIDATE, and on ALLOW calls LendingAdapter's liquidate() to move tokens -- permissionless, like every reference lending protocol's liquidation path. INCREASE_LEVERAGE remains reserved in the enum only." },
];

const deployed = [
  { name: "LedgerLineRegistry", role: "State store", address: "0x88508A6d9266fbc928cC11DEE92f4EB1801B907c" },
  { name: "LedgerLinePolicy", role: "canExecute()", address: "0xD6ECf112af596E82DEb2EEb9e989eE6B093D5460" },
  { name: "PositionEngine", role: "Stylus (Rust/WASM)", address: "0xde8365dAF3CFdF952E2F946F19a4DcAcd57eFf0F" },
  { name: "RiskEngine", role: "Stylus (Rust/WASM) · isLiquidatable()", address: "0x10246f909139Aa83f7C223012bDd656472b3C2bc" },
  { name: "LedgerLineLendingAdapter", role: "BORROW/repay()/liquidate() consumer", address: "0x5e559ADeb6B69E7c6f26c0aE51071a162Aa6560d" },
  { name: "LedgerLineVaultAdapter", role: "WITHDRAW consumer", address: "0x4E94e5AdB0b03Be4E9d7336Da7f847E4E4BA9C43" },
  { name: "LedgerLineTransferAdapter", role: "TRANSFER consumer", address: "0x32D47195108fE08aA518D9779689F83E2154D4f1" },
  { name: "LedgerLineLiquidationAdapter", role: "LIQUIDATE consumer", address: "0xB24Af6a1bAfAB462DAa4776C0bc884Ce70B3a97d" },
  { name: "RobinhoodStockTokenAdapter", role: "Asset adapter · not wired into Registry", address: "0x3A1B5a91DBb68C39647B5a7Fe0aDD1a59Ec3dfb9" },
  { name: "TSLA Stock Token", role: "Collateral · 18 decimals", address: "0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E" },
  { name: "USDG", role: "Borrow asset · 6 decimals", address: "0x7E955252E15c84f5768B83c41a71F9eba181802F" },
];

const stack = [
  ["Asset adapter", "RobinhoodStockTokenAdapter · deployed, not yet wired to Registry"],
  ["Registry / state", "LedgerLineRegistry"],
  ["Position engine", "Stylus · position value"],
  ["Risk engine", "Stylus · borrowing capacity + isLiquidatable()"],
  ["Policy", "canExecute()"],
  ["Financial adapter", "Lending · Vault · Transfer · Liquidation"],
];

const navLinks = [
  ["#primitive", "Primitive"],
  ["#consumers", "Consumers"],
  ["#agents", "Agents"],
  ["#deployment", "Deployment"],
  ["#developer", "Developers"],
];

function short(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function SectionHeading({ id, eyebrow, title, children }: { id?: string; eyebrow: string; title: string; children?: React.ReactNode }) {
  return (
    <div>
      <p className="eyebrow">{eyebrow}</p>
      <h2 id={id} className="mt-5 max-w-md text-3xl font-semibold tracking-tight md:text-4xl">{title}</h2>
      {children && <div className="mt-5 max-w-sm space-y-4 text-sm leading-7 text-terminal-muted">{children}</div>}
    </div>
  );
}

export default function Landing() {
  return (
    <main className="site-shell mx-auto flex max-w-7xl flex-col px-4 sm:px-6 md:px-10">
      <nav className="glass-nav sticky top-3 z-50 mx-auto flex min-h-14 w-full items-center justify-between rounded-2xl px-3 py-2.5 sm:top-4 sm:min-h-16 sm:px-4 sm:py-3 md:px-5" aria-label="Primary navigation">
        <Link href="/" className="flex min-w-0 items-center gap-3 font-semibold tracking-tight"><BrandMark size={32} /><span className="truncate text-[13px] sm:text-base">CortexRails</span><span className="hidden rounded-full border border-terminal-border/80 bg-terminal-bg/30 px-2.5 py-1 font-mono text-[9px] font-normal tracking-normal text-terminal-muted sm:inline"><span className="mr-1.5 text-terminal-accent">●</span>Protocol</span></Link>
        <div className="flex items-center gap-2 text-xs text-terminal-muted md:gap-5">
          <div className="hidden items-center gap-5 lg:flex">
            {navLinks.map(([href, label]) => <a key={href} href={href} className="nav-link transition-colors hover:text-terminal-text">{label}</a>)}
            <a href={REPO} target="_blank" rel="noreferrer" className="nav-link transition-colors hover:text-terminal-text">GitHub</a>
          </div>
          <details className="mobile-nav-menu"><summary className="glass-menu rounded-lg p-2 text-terminal-muted" aria-label="Toggle navigation"><span className="sr-only menu-label">Open navigation</span><span className="sr-only menu-close">Close navigation</span><span className="menu-icon" aria-hidden="true"><i /><i /><i /></span></summary><div className="mobile-nav-panel">{navLinks.map(([href, label]) => <a key={href} href={href}>{label}</a>)}<a href={REPO} target="_blank" rel="noreferrer">GitHub</a></div></details>
          <span className="hidden rounded-full border border-terminal-border/70 bg-terminal-bg/25 px-2.5 py-1 font-mono text-[10px] text-terminal-muted xl:inline"><span className="mr-1.5 text-decision-allow">●</span>Robinhood Chain · Testnet</span>
          <Link href="/app" className="glass-cta rounded-xl px-3.5 py-2.5 text-[10px] font-semibold uppercase tracking-[.12em] text-terminal-text transition-transform hover:-translate-y-0.5 hover:text-terminal-accent sm:px-4">Policy engine <span aria-hidden="true">→</span></Link>
        </div>
      </nav>

      {/* Hero */}
      <section id="product" className="hero-grid relative grid scroll-mt-24 items-center gap-12 border-b border-terminal-border py-12 md:grid-cols-[1.15fr_.85fr] md:py-20">
        <div className="flex flex-col gap-7">
          <div className="flex items-center gap-3"><span className="eyebrow">CortexRails Protocol</span><span className="h-px w-10 bg-terminal-accent" /></div>
          <h1 className="max-w-3xl text-[2.7rem] font-semibold leading-[.98] tracking-[-.055em] sm:text-6xl lg:text-[4.6rem]">Liquidations shouldn&apos;t be <span className="text-terminal-accent">a guess.</span></h1>
          <p className="max-w-xl text-lg leading-8 text-terminal-muted">CortexRails is the deterministic policy layer that decides whether a borrow, withdrawal, transfer, or liquidation is actually safe -- before it executes. Live on Robinhood Chain against real TSLA stock tokens and real USDG, with every liquidation threshold checked against 14 years of real price history, not assumptions.</p>
          <div className="flex flex-wrap gap-3">
            <Link href="/app" className="primary-action px-5 py-3.5 text-xs font-bold uppercase tracking-[.12em] text-terminal-accent-fg transition-transform hover:-translate-y-0.5">Explore the policy engine <span aria-hidden="true" className="ml-1">→</span></Link>
            <a href={REPO} target="_blank" rel="noreferrer" className="secondary-action px-5 py-3.5 text-xs font-bold uppercase tracking-[.12em] transition-colors hover:bg-terminal-surface">View on GitHub</a>
          </div>
          <div className="hero-proof-grid"><div><strong>1</strong><span>policy surface</span></div><div><strong>4</strong><span>consumer adapters</span></div><div><strong>2</strong><span>Stylus engines</span></div></div>
        </div>
        <ol className="intent-flow" aria-label="How a request flows through CortexRails">
          {heroFlow.map((step) => (
            <li key={step.label} className={step.core ? "intent-flow-core" : undefined}>
              <span className="intent-flow-label">{step.label}</span>
              {step.decisions ? (
                <span className="font-mono text-xs"><span className="text-decision-allow">ALLOW</span> / <span className="text-decision-limit">LIMIT</span> / <span className="text-decision-review">REVIEW</span> / <span className="text-decision-block">BLOCK</span></span>
              ) : (
                <span className="intent-flow-detail">{step.detail}</span>
              )}
            </li>
          ))}
        </ol>
      </section>

      {/* Backtest proof */}
      <section id="backtest" className="feature-section grid scroll-mt-24 gap-10 border-b border-terminal-border py-20 md:grid-cols-[.7fr_1.3fr] md:py-24">
        <SectionHeading eyebrow="Proven, not asserted" title="This isn&apos;t a hypothetical.">
          <p>CortexRails&apos; live risk formulas were run against 14 years of real TSLA price history (2010-2024) -- not a synthetic backtest, not a cherry-picked window.</p>
          <p>The result is a provable, closed-form finding: at the testnet&apos;s live parameters, a full-capacity borrower becomes liquidatable the instant the asset falls exactly 20% below the price they borrowed at -- no more, no less. <a href={`${REPO}/blob/master/docs/ANALYSIS.md`} target="_blank" rel="noreferrer" className="text-terminal-text underline underline-offset-4">Full methodology and data in docs/ANALYSIS.md</a>.</p>
        </SectionHeading>
        <div className="flex flex-col gap-6">
          <div className="signal-card font-mono text-xs leading-7 text-terminal-muted sm:text-sm">
            <div className="text-terminal-text">Worked example -- the November 2021 all-time high</div>
            A borrower opens a full-capacity position on <span className="text-terminal-text">2021-11-04</span> at <span className="text-terminal-text">$409.97</span>. CortexRails&apos; live 80% risk adjustment puts their liquidation trigger at <span className="text-terminal-text">$327.98</span>. TSLA&apos;s real price first crosses below that line on <span className="text-terminal-text">2021-12-13</span>, at <span className="text-terminal-text">$322.14</span> -- <span className="text-decision-limit">26 real trading days later</span>.
          </div>
          <div className="hero-proof-grid"><div><strong>70%</strong><span>of historical entry days eventually crossed the trigger</span></div><div><strong>72</strong><span>median trading days to liquidation</span></div><div><strong>1</strong><span>fastest trading day to trigger</span></div></div>
        </div>
      </section>

      {/* Agents */}
      <section id="agents" className="feature-section grid scroll-mt-24 gap-10 border-b border-terminal-border py-20 md:grid-cols-[.8fr_1.2fr] md:py-24" aria-labelledby="agents-title">
        <SectionHeading id="agents-title" eyebrow="Autonomous agents" title="Agents propose. CortexRails decides.">
          <p>Autonomous agents can determine what they want to do. Financial protocols still need a deterministic boundary that decides what they are actually allowed to do.</p>
          <p>CortexRails evaluates the requested action against the current asset, position, lifecycle, and policy state before execution.</p>
        </SectionHeading>
        <div className="flex flex-col justify-center gap-6">
          <div className="architecture-flow architecture-flow-4">
            <div className="flow-node"><span className="eyebrow">01 · Offchain</span><strong>Agent intent</strong><small>Structured request: asset, position, action, amount</small></div>
            <span className="flow-arrow">→</span>
            <div className="flow-node flow-core"><span className="eyebrow">02 · Onchain read</span><strong>CortexRails policy evaluation</strong><small>Policy.canExecute()</small></div>
            <span className="flow-arrow">→</span>
            <div className="flow-node"><span className="eyebrow">03 · Result</span><strong className="font-mono text-sm"><span className="text-decision-allow">ALLOW</span> / <span className="text-decision-limit">LIMIT</span> / <span className="text-decision-block">BLOCK</span></strong><small>decision · permittedAmount · reason</small></div>
            <span className="flow-arrow">→</span>
            <div className="flow-node"><span className="eyebrow">04 · Onchain write</span><strong>Adapter execution</strong><small>The adapter re-checks policy in the same transaction</small></div>
          </div>
          <p className="max-w-2xl text-sm leading-7 text-terminal-muted">No model sits in the decision path. The agent layer only translates units and enum names, and the authoritative answer is the onchain <code className="font-mono text-terminal-text">canExecute()</code> result. Every adapter calls <code className="font-mono text-terminal-text">canExecute()</code> again at execution time, so a stale or skipped evaluation can&apos;t bypass policy.</p>
        </div>
      </section>

      {/* Primitive */}
      <section id="primitive" className="feature-section grid scroll-mt-24 gap-10 border-b border-terminal-border py-20 md:grid-cols-[.7fr_1.3fr] md:py-24">
        <SectionHeading eyebrow="The policy primitive" title="One call before value moves.">
          <p>Every consumer asks the same question through the same function. The same policy surface is called before different financial actions.</p>
          <p><code className="font-mono text-terminal-text">canExecute()</code> is a <code className="font-mono text-terminal-text">view</code> function. It never moves funds or enforces anything itself; the calling contract does both.</p>
        </SectionHeading>
        <div className="grid min-w-0 gap-5">
          <div className="min-w-0"><p className="eyebrow mb-3">ILedgerLinePolicy</p><pre className="code-card min-w-0 overflow-x-auto p-6 text-xs leading-6 text-terminal-muted"><code>{canExecuteCode}</code></pre></div>
          <div className="min-w-0"><p className="eyebrow mb-3">A consumer enforcing it · LendingAdapter.borrow()</p><pre className="code-card min-w-0 overflow-x-auto p-6 text-xs leading-6 text-terminal-muted"><code>{consumerCode}</code></pre></div>
        </div>
      </section>

      {/* Consumers */}
      <section id="consumers" className="feature-section scroll-mt-24 border-b border-terminal-border py-20 md:py-24">
        <div className="grid gap-10 md:grid-cols-[.7fr_1.3fr]">
          <SectionHeading eyebrow="Reuse" title="One policy surface. Multiple financial consumers." />
          <p className="max-w-xl self-end text-sm leading-7 text-terminal-muted">Three independent adapter contracts call the same, unmodified Registry, Stylus engines, and Policy. Adding WITHDRAW and then TRANSFER needed no change to the Registry or either engine, just one new Policy branch each.</p>
        </div>
        <div className="consumer-grid mt-12">
          {consumers.map((c) => (
            <article key={c.action} className="consumer-card">
              <div className="flex items-baseline justify-between gap-3"><h3 className="font-mono text-lg font-semibold tracking-tight">{c.action}</h3><span className="font-mono text-[10px] text-terminal-muted">Action.{c.action}</span></div>
              <p className="text-sm leading-7 text-terminal-muted">{c.text}</p>
              <dl className="consumer-checks">
                <div><dt>Policy</dt><dd>{c.policy}</dd></div>
                <div><dt>Adapter</dt><dd>{c.adapter}</dd></div>
              </dl>
              <p className="font-mono text-[10px] text-terminal-muted">{c.contract}</p>
            </article>
          ))}
        </div>
      </section>

      {/* Decisions */}
      <section id="decisions" className="feature-section scroll-mt-24 border-b border-terminal-border py-20 md:py-24">
        <div className="grid gap-10 md:grid-cols-[.7fr_1.3fr]">
          <SectionHeading eyebrow="Decision model" title="Deterministic decisions.">
            <p>The same state and the same request always produce the same response. LIMIT returns the maximum permitted amount, and CortexRails never quietly reduces the request. The caller decides whether to resubmit.</p>
          </SectionHeading>
          <div className="decision-grid">
            {decisions.map((d) => <div key={d.name} className={d.reserved ? "decision-reserved" : undefined}><span className={`font-mono text-xl font-semibold ${d.tone}`}>{d.name}</span>{d.reserved && <span className="reserved-tag">Reserved</span>}<p>{d.text}</p></div>)}
          </div>
        </div>
        <div className="mt-12"><LandingPolicyDemo /></div>
      </section>

      {/* Inputs */}
      <section id="inputs" className="feature-section grid scroll-mt-24 gap-10 border-b border-terminal-border py-20 md:grid-cols-[.7fr_1.3fr] md:py-24">
        <SectionHeading eyebrow="Policy inputs" title="Policy is state-aware.">
          <p>A balance and a price are not the whole story. Tokenized assets carry lifecycle state that can change whether an action should execute at all.</p>
        </SectionHeading>
        <div className="flex flex-col gap-6">
          <dl className="input-list">
            {inputs.map((i) => <div key={i.name}><dt>{i.name}</dt><dd>{i.text}</dd></div>)}
          </dl>
          <div className="signal-card font-mono text-xs leading-7 text-terminal-muted sm:text-sm">STATE + POSITION + RISK + LIFECYCLE + ACTION <span className="text-terminal-accent">→</span> <span className="text-terminal-text">POLICY DECISION</span></div>
        </div>
      </section>

      {/* Agent example */}
      <section id="agent-example" className="feature-section grid scroll-mt-24 gap-10 border-b border-terminal-border py-20 md:grid-cols-[.7fr_1.3fr] md:py-24">
        <SectionHeading eyebrow="Agent intent / policy evaluation" title="An agent asks. CortexRails answers.">
          <p>An illustrative $200,000 TSLA position under the testnet configuration (70% collateral factor, 80% risk adjustment) has $112,000 of borrowing capacity.</p>
          <p>This walkthrough is illustrative. The policy engine at <Link href="/app#agent-demo" className="text-terminal-text underline underline-offset-4">/app</Link> runs the same flow against the deployed contract with your connected wallet&apos;s real position.</p>
        </SectionHeading>
        <div className="agent-exchange">
          <div className="agent-turn"><span className="agent-role">Agent</span><p>&ldquo;Borrow 120,000 USDG against TSLA.&rdquo;</p></div>
          <div className="agent-turn agent-turn-policy">
            <span className="agent-role">CortexRails</span>
            <div className="font-mono text-2xl font-semibold text-decision-limit">LIMIT</div>
            <dl className="agent-result"><div><dt>Requested</dt><dd>$120,000</dd></div><div><dt>Permitted</dt><dd>$112,000</dd></div><div><dt>Reason</dt><dd>EXCEEDS_CAPACITY</dd></div></dl>
          </div>
          <div className="agent-turn"><span className="agent-role">Agent adjusts</span><p>&ldquo;Borrow 112,000 USDG.&rdquo;</p></div>
          <div className="agent-turn agent-turn-policy">
            <span className="agent-role">CortexRails</span>
            <div className="font-mono text-2xl font-semibold text-decision-allow">ALLOW</div>
            <dl className="agent-result"><div><dt>Requested</dt><dd>$112,000</dd></div><div><dt>Permitted</dt><dd>$112,000</dd></div><div><dt>Reason</dt><dd>OK</dd></div></dl>
          </div>
          <div className="agent-turn"><span className="agent-role">Execution</span><p>LendingAdapter.borrow() re-evaluates policy, checks existing debt, then transfers USDG.</p></div>
        </div>
      </section>

      {/* Deployment */}
      <section id="deployment" className="feature-section scroll-mt-24 border-b border-terminal-border py-20 md:py-24">
        <div className="grid gap-10 md:grid-cols-[.7fr_1.3fr]">
          <SectionHeading eyebrow="Live deployment" title="Deployed on Robinhood Chain testnet.">
            <p>Chain ID 46630. The current testnet deployment demonstrates CortexRails against the real TSLA Stock Token and USDG contracts, while policy state and reference pricing remain operator-configured in the test environment.</p>
          </SectionHeading>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="status-block"><span className="eyebrow status-real">Real / deployed</span><ul><li>Robinhood Chain testnet</li><li>Real TSLA Stock Token collateral</li><li>Real USDG borrow asset (6-decimal scaling)</li><li>Stylus PositionEngine and RiskEngine</li><li>Registry, Policy, four consumer adapters (Lending, Vault, Transfer, Liquidation)</li><li>canExecute() computed live on every call</li></ul></div>
            <div className="status-block"><span className="eyebrow status-config">Operator-configured</span><ul><li>Policy reference price ($364.27)</li><li>Lifecycle state</li><li>Collateral factor and risk adjustment</li><li>No oracle pushes into the Registry automatically</li></ul></div>
            <div className="status-block"><span className="eyebrow status-none">Not claimed</span><ul><li>Mainnet or production readiness</li><li>Decentralized live equity pricing</li><li>Automatic oracle-to-policy sync</li><li>Support for every tokenized asset</li><li>Third-party audit</li></ul></div>
          </div>
        </div>
        <div className="mt-12 overflow-x-auto">
          <table className="address-table">
            <thead><tr><th scope="col">Contract</th><th scope="col">Role</th><th scope="col">Address</th></tr></thead>
            <tbody>
              {deployed.map((d) => (
                <tr key={d.address}>
                  <td className="font-mono text-terminal-text">{d.name}</td>
                  <td>{d.role}</td>
                  <td><a href={`${EXPLORER}/address/${d.address}`} target="_blank" rel="noreferrer" className="font-mono text-terminal-text underline-offset-4 hover:text-terminal-accent hover:underline" title={d.address}>{short(d.address)} ↗</a></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-4 max-w-3xl text-xs leading-6 text-terminal-muted">Every address above has live bytecode on Robinhood Chain testnet. Block numbers, deploy transactions, and the VaultAdapter redeploy history are in <a href={`${REPO}/blob/master/docs/DEPLOYMENTS.md`} target="_blank" rel="noreferrer" className="text-terminal-text underline underline-offset-4">DEPLOYMENTS.md</a>.</p>
        </div>
      </section>

      {/* Architecture */}
      <section id="architecture" className="feature-section grid scroll-mt-24 gap-10 border-b border-terminal-border py-20 md:grid-cols-[.7fr_1.3fr] md:py-24">
        <SectionHeading eyebrow="Architecture" title="Deciding is separate from executing.">
          <p>The Registry holds state. Two stateless Stylus contracts compute position value and capacity. Policy turns that into a decision. Adapters custody funds and enforce the decision. The agent layer sits outside this deterministic core.</p>
        </SectionHeading>
        <ol className="stack-list">
          {stack.map(([layer, impl], index) => (
            <li key={layer} className={layer === "Policy" ? "stack-core" : undefined}><span className="font-mono text-[10px] text-terminal-muted">{String(index + 1).padStart(2, "0")}</span><strong>{layer}</strong><small>{impl}</small></li>
          ))}
        </ol>
      </section>

      {/* Developers */}
      <section id="developer" className="feature-section grid scroll-mt-24 gap-10 border-b border-terminal-border py-20 md:grid-cols-[.7fr_1.3fr] md:py-24">
        <SectionHeading eyebrow="Developers" title="Integrate the decision surface.">
          <p>Applications and autonomous agents can submit structured action intents to CortexRails and receive the authoritative policy result before execution.</p>
          <p className="font-mono text-xs text-terminal-text">Intent → SDK → CortexRails Policy → Decision</p>
          <p>Solidity consumers call <code className="font-mono text-terminal-text">canExecute()</code> directly. Offchain code uses <code className="font-mono text-terminal-text">@ledgerline/core</code>, a typed viem client in this repo&apos;s <code className="font-mono text-terminal-text">sdk/</code> directory. It is not yet published to npm.</p>
          <div className="flex flex-wrap gap-4 pt-1 font-mono text-xs"><a href={`${REPO}/tree/master/sdk`} target="_blank" rel="noreferrer" className="text-terminal-text underline underline-offset-4 hover:text-terminal-accent">SDK source ↗</a><a href={`${REPO}/blob/master/docs/POLICY.md`} target="_blank" rel="noreferrer" className="text-terminal-text underline underline-offset-4 hover:text-terminal-accent">Policy rules ↗</a><a href={`${REPO}/blob/master/docs/ARCHITECTURE.md`} target="_blank" rel="noreferrer" className="text-terminal-text underline underline-offset-4 hover:text-terminal-accent">Architecture ↗</a></div>
        </SectionHeading>
        <div className="min-w-0"><p className="eyebrow mb-3">TypeScript · sdk/src/agent.ts</p><pre className="code-card min-w-0 overflow-x-auto p-6 text-xs leading-6 text-terminal-muted"><code>{sdkCode}</code></pre></div>
      </section>

      <section className="flex flex-col gap-7 py-20 md:flex-row md:items-end md:justify-between md:py-24">
        <div><p className="eyebrow">Agents propose. CortexRails decides. Adapters execute.</p><h2 className="mt-5 max-w-2xl text-4xl font-semibold tracking-tight md:text-5xl">Evaluate a real position against the deployed policy.</h2></div>
        <div className="flex flex-wrap gap-3"><Link href="/app" className="primary-action px-5 py-3.5 text-xs font-bold uppercase tracking-[.12em] text-terminal-accent-fg">Explore the policy engine →</Link><a href={REPO} target="_blank" rel="noreferrer" className="secondary-action px-5 py-3.5 text-xs font-bold uppercase tracking-[.12em] transition-colors hover:bg-terminal-surface">View on GitHub</a></div>
      </section>

      <footer className="flex flex-col gap-5 border-t border-terminal-border py-7 text-xs text-terminal-muted sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-2"><BrandMark size={20} /><span>CortexRails Protocol</span></div><div className="flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[10px] uppercase tracking-[.12em]"><a href="#primitive" className="transition-colors hover:text-terminal-text">Primitive</a><a href="#deployment" className="transition-colors hover:text-terminal-text">Deployment</a><a href="#developer" className="transition-colors hover:text-terminal-text">Developers</a><a href={REPO} target="_blank" rel="noreferrer" className="transition-colors hover:text-terminal-text">GitHub</a><span className="text-terminal-border">Testnet</span></div></footer>
    </main>
  );
}
