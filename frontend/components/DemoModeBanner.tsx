import type { DemoScenarioId } from "@/lib/demoScenarios";

const SCENARIO_COPY: Record<DemoScenarioId, string> = {
  "borrow": "Borrow — opens at $1,001 (illustrative LIMIT preview); change the amount and it switches to the real live policy check and, on ALLOW, a real transaction.",
  "transfer-block": "Transfer · BLOCK preview — illustrative outstanding-debt state, not live chain data.",
  "withdraw": "Withdraw demo — live position data, amount field ready for a walkthrough.",
  "liquidation": "Liquidation demo — enter a borrower with real outstanding debt above threshold to see a live decision.",
};

/// Visually distinct from the `isReadOnly` (?viewAs) banner in
/// PolicyConsole so a viewer/recording can never confuse "demo preview"
/// with "real read-only view of a real position."
export function DemoModeBanner({ scenario }: { scenario: DemoScenarioId }) {
  return (
    <p
      className="mb-6 rounded-[.6rem] border border-terminal-accent/40 bg-terminal-accent/10 px-3 py-2 font-mono text-[10px] uppercase tracking-[.1em] text-terminal-accent"
      role="status"
      data-demo-scenario={scenario}
    >
      DEMO MODE · {SCENARIO_COPY[scenario]}
    </p>
  );
}
