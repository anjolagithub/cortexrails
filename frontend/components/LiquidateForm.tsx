"use client";

import { useState } from "react";
import { useReadContract } from "wagmi";
import { isAddress, type Address } from "viem";
import { useEffectiveAddress } from "@/lib/useEffectiveAddress";
import {
  REGISTRY,
  POLICY,
  LENDING_ADAPTER,
  LIQUIDATION_ADAPTER,
  BORROW_TOKEN,
  ASSET_ID,
  ONE,
  ACTION_LIQUIDATE,
  DECISION_LABELS,
  formatUnits18,
  bpsToPercent,
  toTokenAmountRoundUp,
} from "@/lib/contracts";
import { useTransactionFlow } from "@/lib/useTransactionFlow";
import { TransactionStatus } from "./TransactionStatus";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

/// CortexRails' first LIQUIDATE consumer, surfaced end to end: check any
/// borrower's real, live debt against Policy.canExecute(Action.LIQUIDATE),
/// then -- only if it returns ALLOW -- submit a real
/// LedgerLineLiquidationAdapter.liquidate() call. Mirrors exactly what
/// the adapter itself does onchain (contracts/src/
/// LedgerLineLiquidationAdapter.sol): derive the borrower's debt from
/// LendingAdapter, ask canExecute with that debt as `amount` (Policy
/// stays debt-agnostic by design), and only on ALLOW does a liquidate()
/// call have any chance of succeeding. Permissionless -- any connected
/// wallet can check or liquidate any borrower's position, not just its
/// own.
export function LiquidateForm({ demoPresetBorrower }: { demoPresetBorrower?: string } = {}) {
  const { address, isReadOnly } = useEffectiveAddress();
  // No fabricated liquidatable state -- the repo doesn't define a
  // standing demo/test borrower (per constraint: don't hardcode one
  // unless the repo already defines it), so this only prefills the
  // input from NEXT_PUBLIC_DEMO_LIQUIDATABLE_BORROWER when an operator
  // has set one, and otherwise leaves the field for a real address with
  // real debt above threshold. Every read below stays live either way.
  const [borrowerInput, setBorrowerInput] = useState(demoPresetBorrower ?? "");
  const [repayAmount, setRepayAmount] = useState("");
  const [seizeAmount, setSeizeAmount] = useState("");

  const borrowerValid = isAddress(borrowerInput);
  const borrower = (borrowerValid ? borrowerInput : ZERO_ADDRESS) as Address;
  const positionId = borrowerValid ? BigInt(borrower) : 0n;

  const { data: debt } = useReadContract({
    address: LENDING_ADAPTER.address,
    abi: LENDING_ADAPTER.abi,
    functionName: "debt",
    args: [borrower],
    query: { enabled: borrowerValid },
  }) as { data: bigint | undefined };

  const { data: position } = useReadContract({
    address: REGISTRY.address,
    abi: REGISTRY.abi,
    functionName: "getPosition",
    args: [ASSET_ID, positionId],
    query: { enabled: borrowerValid },
  }) as { data: { rawBalance: bigint } | undefined };

  const { data: assetState } = useReadContract({
    address: REGISTRY.address,
    abi: REGISTRY.abi,
    functionName: "getAssetState",
    args: [ASSET_ID],
  }) as { data: { price: bigint; collateralFactorBps: bigint } | undefined };

  const { data: borrowTokenDecimals } = useReadContract({
    address: LENDING_ADAPTER.address,
    abi: LENDING_ADAPTER.abi,
    functionName: "borrowTokenDecimals",
  }) as { data: number | undefined };

  const hasDebt = !!debt && debt > 0n;

  // Same canExecute call LiquidationAdapter itself makes -- the
  // borrower's real, live debt supplied as `amount`, since Policy is
  // deliberately debt-agnostic. Only queried once there's a real debt
  // to check; canExecute(0) for LIQUIDATE is unconditionally BLOCK
  // (REASON_ABOVE_MAINTENANCE), so there's nothing useful to preview
  // for a debt-free position.
  const policyRead = useReadContract({
    address: POLICY.address,
    abi: POLICY.abi,
    functionName: "canExecute",
    args: [ASSET_ID, positionId, ACTION_LIQUIDATE, debt ?? 0n],
    query: { enabled: borrowerValid && hasDebt },
  });
  const response = policyRead.data as { decision: number; permittedAmount: bigint; reason: string } | undefined;
  const decisionLabel = response ? DECISION_LABELS[response.decision] : undefined;
  const isLiquidatable = decisionLabel === "ALLOW";

  const positionValue =
    position && assetState ? (position.rawBalance * assetState.price) / ONE : undefined;
  const maintenanceThreshold =
    positionValue !== undefined && assetState
      ? (positionValue * assetState.collateralFactorBps) / 10_000n
      : undefined;

  const parsedRepay = repayAmount && Number.isFinite(Number(repayAmount))
    ? BigInt(Math.max(0, Math.floor(Number(repayAmount)))) * ONE
    : 0n;
  const parsedSeize = seizeAmount && Number.isFinite(Number(seizeAmount))
    ? BigInt(Math.max(0, Math.floor(Number(seizeAmount)))) * ONE
    : 0n;

  const repayExceedsDebt = parsedRepay > 0n && !!debt && parsedRepay > debt;
  const seizeExceedsPosition =
    parsedSeize > 0n && !!position && parsedSeize > position.rawBalance;

  const requiredUsdg =
    parsedRepay > 0n && borrowTokenDecimals !== undefined
      ? toTokenAmountRoundUp(parsedRepay, borrowTokenDecimals)
      : 0n;

  const approveTx = useTransactionFlow();
  const liquidateTx = useTransactionFlow();
  const submitting =
    liquidateTx.status === "wallet-confirmation" || liquidateTx.status === "pending";

  const approveDisabled =
    !address || isReadOnly || requiredUsdg === 0n ||
    approveTx.status === "wallet-confirmation" || approveTx.status === "pending";
  const liquidateDisabled =
    !address ||
    isReadOnly ||
    !isLiquidatable ||
    parsedRepay === 0n ||
    parsedSeize === 0n ||
    repayExceedsDebt ||
    seizeExceedsPosition ||
    submitting;

  return (
    <div className="form-card">
      <div className="form-card-title">Check &amp; Liquidate a Position</div>
      <p className="field-hint mb-3 mt-0">
        Permissionless -- checks any borrower&apos;s live debt against the same canExecute()
        the LiquidationAdapter itself calls.
      </p>
      <label htmlFor="liquidate-borrower" className="field-label">
        Borrower address
      </label>
      <div className="flex gap-2">
        <input
          id="liquidate-borrower"
          type="text"
          value={borrowerInput}
          onChange={(e) => setBorrowerInput(e.target.value)}
          placeholder="0x..."
          aria-describedby="liquidate-borrower-help"
          className="field-input mb-1 font-mono"
        />
        {address && (
          <button
            type="button"
            onClick={() => setBorrowerInput(address)}
            className="form-action form-action-secondary whitespace-nowrap"
          >
            My address
          </button>
        )}
      </div>
      {borrowerInput.length > 0 && !borrowerValid && (
        <div id="liquidate-borrower-help" className="field-error">
          Not a valid address
        </div>
      )}

      {borrowerValid && (
        <div className="mt-4 space-y-2 rounded-[.75rem] border border-terminal-border bg-terminal-surface2 p-4">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-terminal-muted">Outstanding debt</span>
            <span className="font-mono tabular-nums">${formatUnits18(debt)}</span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-terminal-muted">Position value</span>
            <span className="font-mono tabular-nums">${formatUnits18(positionValue)}</span>
          </div>
          <div className="flex items-baseline justify-between border-b border-terminal-border pb-2">
            <span className="text-sm text-terminal-muted">
              Maintenance threshold ({bpsToPercent(assetState?.collateralFactorBps)})
            </span>
            <span className="font-mono tabular-nums">${formatUnits18(maintenanceThreshold)}</span>
          </div>
          {!hasDebt ? (
            <div className="pt-1 text-sm text-terminal-muted">No outstanding debt -- nothing to liquidate.</div>
          ) : (
            <div className="pt-1 text-center">
              <div
                className={`text-2xl font-bold ${
                  isLiquidatable ? "text-decision-allow" : "text-decision-block"
                }`}
              >
                {decisionLabel ?? "—"}
              </div>
              <div className="mt-1 text-xs text-terminal-muted">
                {isLiquidatable
                  ? "Debt exceeds the maintenance threshold -- eligible for liquidation."
                  : "Debt is within the maintenance threshold -- not eligible."}
              </div>
            </div>
          )}
        </div>
      )}

      {borrowerValid && hasDebt && isLiquidatable && (
        <div className="mt-4 space-y-3 border-t border-terminal-border pt-4">
          <div>
            <label htmlFor="liquidate-repay" className="field-label">
              Repay amount (USD, of ${formatUnits18(debt)} debt)
            </label>
            <input
              id="liquidate-repay"
              type="number"
              min="0"
              step="1"
              inputMode="decimal"
              value={repayAmount}
              onChange={(e) => setRepayAmount(e.target.value)}
              placeholder="0"
              className="field-input mb-1"
            />
            {repayExceedsDebt && <div className="field-error">Exceeds outstanding debt</div>}
          </div>
          <div>
            <label htmlFor="liquidate-seize" className="field-label">
              Seize amount (shares, of {formatUnits18(position?.rawBalance)} position)
            </label>
            <input
              id="liquidate-seize"
              type="number"
              min="0"
              step="1"
              inputMode="decimal"
              value={seizeAmount}
              onChange={(e) => setSeizeAmount(e.target.value)}
              placeholder="0"
              className="field-input mb-1"
            />
            {seizeExceedsPosition && <div className="field-error">Exceeds borrower&apos;s position</div>}
          </div>
          <p className="field-hint">
            You choose both amounts -- this contract enforces eligibility, not a fixed bonus
            formula. Size seizeAmount as a fair exchange for repayAmount using the live price
            above.
          </p>
          {liquidateTx.status === "wrong-network" ? (
            <button onClick={liquidateTx.switchToCorrectNetwork} className="form-action form-action-primary">
              Switch Network
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                disabled={approveDisabled}
                onClick={() =>
                  approveTx.execute({
                    address: BORROW_TOKEN.address,
                    abi: BORROW_TOKEN.abi,
                    functionName: "approve",
                    args: [LENDING_ADAPTER.address, requiredUsdg],
                  })
                }
                className="form-action form-action-secondary flex-1"
              >
                Approve USDG
              </button>
              <button
                disabled={liquidateDisabled}
                onClick={() =>
                  liquidateTx.execute({
                    address: LIQUIDATION_ADAPTER.address,
                    abi: LIQUIDATION_ADAPTER.abi,
                    functionName: "liquidate",
                    args: [borrower, parsedRepay, parsedSeize],
                  })
                }
                className="form-action form-action-primary flex-1"
              >
                {isReadOnly ? "Read-only" : "Liquidate"}
              </button>
            </div>
          )}
          <TransactionStatus status={approveTx.status} hash={approveTx.hash} message={approveTx.message} />
          <TransactionStatus status={liquidateTx.status} hash={liquidateTx.hash} message={liquidateTx.message} />
        </div>
      )}
    </div>
  );
}
