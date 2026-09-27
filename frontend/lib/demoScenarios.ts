"use client";

import { useSearchParams } from "next/navigation";
import { ONE } from "./contracts";

/// URL-driven demo mode for recording reliable, reproducible hackathon
/// walkthroughs (Demosmith or a human presenter). `?demo=<id>` selects a
/// scenario; PolicyConsole reads it and feeds deterministic preview
/// props into the existing Borrow/Transfer/Withdraw/Liquidate forms
/// instead of live contract reads, ONLY for the illustrative
/// LIMIT/BLOCK states below. It never fabricates a submitted
/// transaction, never touches LIVE MODE (no `demo` param = 100%
/// unchanged existing behavior), and never overrides the real
/// canExecute/write calls used for actual execution.
export type DemoScenarioId =
  | "borrow-limit"
  | "borrow-allow"
  | "transfer-block"
  | "withdraw"
  | "liquidation";

const DEMO_SCENARIO_IDS: readonly DemoScenarioId[] = [
  "borrow-limit",
  "borrow-allow",
  "transfer-block",
  "withdraw",
  "liquidation",
];

export function isDemoScenarioId(value: string | null): value is DemoScenarioId {
  return !!value && (DEMO_SCENARIO_IDS as readonly string[]).includes(value);
}

/// Reads `?demo=` from the URL. Returns null for LIVE MODE (no param,
/// or a value that isn't one of the five known scenarios) so an
/// unrecognized value fails safe into ordinary live behavior rather
/// than a half-configured demo state.
export function useDemoScenario(): DemoScenarioId | null {
  const searchParams = useSearchParams();
  const raw = searchParams.get("demo");
  return isDemoScenarioId(raw) ? raw : null;
}

/// Purely illustrative numbers for the `borrow-limit` preview -- never
/// read from or written to any contract. Chosen so
/// positionValue * collateralFactor * riskAdjustment ≈ effectiveCapacity,
/// matching the same formula PolicyEquation already renders live.
export const DEMO_BORROW_LIMIT = {
  positionValue: 1_092n * ONE,
  collateralFactorBps: 8_000n, // 80%
  riskAdjustmentBps: 7_000n, // 70%
  effectiveCapacity: 611n * ONE, // 1092 * 0.80 * 0.70 ≈ 611.52
  requestedAmount: 1_001n * ONE,
  response: {
    decision: 1, // LIMIT
    permittedAmount: 611n * ONE,
    reason: "Requested amount exceeds effective capacity",
  },
};

/// `borrow-allow` intentionally carries no forced decision or amount --
/// it only presets the input to "5" (see BorrowForm) and then runs the
/// exact same live canExecute -> borrow() path as LIVE MODE, because
/// requirement #3 is that this leg stays real, not simulated.
export const DEMO_BORROW_ALLOW_PRESET_AMOUNT = "5";

/// Illustrative preview for `transfer-block` -- shows the existing
/// debt-blocks-transfer reason using the real component/copy, without
/// requiring a specific live testnet position to actually be in debt
/// at demo time.
export const DEMO_TRANSFER_BLOCK = {
  positionRawBalance: 250n * ONE,
  reason: "Outstanding debt blocks transfer — repay first.",
};
