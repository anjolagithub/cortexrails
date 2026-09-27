"use client";

import { useState } from "react";
import { useReadContract } from "wagmi";
import { POLICY, LENDING_ADAPTER, ASSET_ID, ONE } from "@/lib/contracts";
import { useEffectiveAddress } from "@/lib/useEffectiveAddress";
import { useTransactionFlow } from "@/lib/useTransactionFlow";
import { PolicyEquation } from "./PolicyEquation";
import { PolicyVerdict } from "./PolicyVerdict";
import { TransactionStatus } from "./TransactionStatus";

export function BorrowForm({
  positionValue,
  collateralFactorBps,
  riskAdjustmentBps,
  effectiveCapacity,
  lifecycle,
}: {
  positionValue: bigint | undefined;
  collateralFactorBps: bigint | undefined;
  riskAdjustmentBps: bigint | undefined;
  effectiveCapacity: bigint | undefined;
  lifecycle: number | undefined;
}) {
  const { address, isReadOnly } = useEffectiveAddress();
  const [amount, setAmount] = useState("");
  const parsedAmount = amount && Number.isFinite(Number(amount))
    ? BigInt(Math.max(0, Math.floor(Number(amount)))) * ONE
    : 0n;
  const positionId = address ? BigInt(address) : 0n;

  const policyRead = useReadContract({
    address: POLICY.address,
    abi: POLICY.abi,
    functionName: "canExecute",
    args: [ASSET_ID, positionId, 0, parsedAmount], // Action.BORROW = 0
    query: { enabled: !!address && parsedAmount > 0n },
  });
  const response = policyRead.data as { decision: number; permittedAmount: bigint; reason: string } | undefined;
  const isEvaluating = policyRead.isLoading;
  const evaluationError = policyRead.error;

  const tx = useTransactionFlow();
  const decisionLabel = response ? ["ALLOW", "LIMIT", "REVIEW", "BLOCK"][response.decision] : undefined;
  const canSubmit = decisionLabel === "ALLOW";
  const hasAmount = parsedAmount > 0n;
  const isReady = !!address && hasAmount && !isEvaluating && !!response;
  const evaluationMessage = !address
    ? "Connect a wallet to evaluate this position."
    : !hasAmount
    ? "Enter an amount to evaluate a borrow request."
    : isEvaluating
    ? "Reading the current policy…"
    : evaluationError
    ? "Policy unavailable. Check the network and contract configuration."
    : undefined;
  const submitting = tx.status === "wallet-confirmation" || tx.status === "pending";

  return (
    <div className="space-y-4">
      <div className="form-card">
        <div className="form-card-title">Policy Evaluation</div>

        <PolicyEquation
          positionValue={positionValue}
          collateralFactorBps={collateralFactorBps}
          riskAdjustmentBps={riskAdjustmentBps}
          effectiveCapacity={effectiveCapacity}
        />

        <div className="mt-4">
          {evaluationMessage ? (
            <div className="rounded-[.6rem] border border-terminal-border bg-terminal-bg px-4 py-4 text-sm text-terminal-muted" role="status">
              {evaluationMessage}
            </div>
          ) : (
            <PolicyVerdict requestedAmount={parsedAmount} lifecycle={lifecycle} response={response} />
          )}
        </div>
      </div>

      <div className="form-card">
        <label htmlFor="borrow-amount" className="field-label">
          Borrow Amount (USD)
        </label>
        <div className="field-prefix-group">
          <input
            id="borrow-amount"
            type="number"
            min="0"
            step="1"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="100,000"
            aria-describedby="borrow-help"
            className="field-input mb-1"
          />
        </div>
        <p id="borrow-help" className="field-hint mb-3">Policy is evaluated before any transaction is sent.</p>
        {tx.status === "wrong-network" ? (
          <button onClick={tx.switchToCorrectNetwork} className="form-action form-action-primary">
            Switch Network
          </button>
        ) : (
          <button
            disabled={!isReady || !canSubmit || submitting || isReadOnly}
            onClick={() =>
              tx.execute({
                address: LENDING_ADAPTER.address,
                abi: LENDING_ADAPTER.abi,
                functionName: "borrow",
                args: [parsedAmount],
              })
            }
            className="form-action form-action-primary"
          >
            {isReadOnly ? "Read-only view — connect a wallet to submit" : canSubmit ? "Borrow" : "Preview only — adjust amount"}
          </button>
        )}
        <TransactionStatus status={tx.status} hash={tx.hash} message={tx.message} />
      </div>
    </div>
  );
}
