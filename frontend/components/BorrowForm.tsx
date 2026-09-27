"use client";

import { useState } from "react";
import { useReadContract } from "wagmi";
import { POLICY, LENDING_ADAPTER, ASSET_ID, ONE } from "@/lib/contracts";
import { useEffectiveAddress } from "@/lib/useEffectiveAddress";
import { useTransactionFlow } from "@/lib/useTransactionFlow";
import { DEMO_BORROW_LIMIT, DEMO_BORROW_ALLOW_PRESET_AMOUNT } from "@/lib/demoScenarios";
import { PolicyEquation } from "./PolicyEquation";
import { PolicyVerdict } from "./PolicyVerdict";
import { TransactionStatus } from "./TransactionStatus";

type BorrowDemoOverride = { kind: "borrow-limit" } | { kind: "borrow-allow" };

export function BorrowForm({
  positionValue,
  collateralFactorBps,
  riskAdjustmentBps,
  effectiveCapacity,
  lifecycle,
  demoOverride,
}: {
  positionValue: bigint | undefined;
  collateralFactorBps: bigint | undefined;
  riskAdjustmentBps: bigint | undefined;
  effectiveCapacity: bigint | undefined;
  lifecycle: number | undefined;
  demoOverride?: BorrowDemoOverride;
}) {
  const { address, isReadOnly } = useEffectiveAddress();
  const isLimitPreview = demoOverride?.kind === "borrow-limit";
  const [amount, setAmount] = useState(() =>
    demoOverride?.kind === "borrow-limit" ? "1001" : demoOverride?.kind === "borrow-allow" ? DEMO_BORROW_ALLOW_PRESET_AMOUNT : ""
  );
  const parsedAmount = amount && Number.isFinite(Number(amount))
    ? BigInt(Math.max(0, Math.floor(Number(amount)))) * ONE
    : 0n;
  const positionId = address ? BigInt(address) : 0n;

  // The LIMIT preview never calls canExecute -- it displays a fixed,
  // clearly-labeled illustrative response instead (see DemoModeBanner).
  // `borrow-allow` sets no override here at all: it only preset the
  // amount above and otherwise runs this exact same live query, because
  // the real ALLOW -> real borrow() -> explorer link is the one leg of
  // the demo that must stay genuine.
  const policyRead = useReadContract({
    address: POLICY.address,
    abi: POLICY.abi,
    functionName: "canExecute",
    args: [ASSET_ID, positionId, 0, parsedAmount], // Action.BORROW = 0
    query: { enabled: !isLimitPreview && !!address && parsedAmount > 0n, retry: 2 },
  });
  const response = isLimitPreview
    ? DEMO_BORROW_LIMIT.response
    : (policyRead.data as { decision: number; permittedAmount: bigint; reason: string } | undefined);
  const isEvaluating = !isLimitPreview && policyRead.isLoading;
  const evaluationError = !isLimitPreview && policyRead.error;

  const tx = useTransactionFlow();
  const decisionLabel = response ? ["ALLOW", "LIMIT", "REVIEW", "BLOCK"][response.decision] : undefined;
  // LIMIT preview never allows a real submit -- it's illustration only,
  // per "Do not fake a transaction."
  const canSubmit = !isLimitPreview && decisionLabel === "ALLOW";
  const hasAmount = parsedAmount > 0n;
  const isReady = isLimitPreview ? true : !!address && hasAmount && !isEvaluating && !!response;
  const evaluationMessage = isLimitPreview
    ? undefined
    : !address
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
          positionValue={isLimitPreview ? DEMO_BORROW_LIMIT.positionValue : positionValue}
          collateralFactorBps={isLimitPreview ? DEMO_BORROW_LIMIT.collateralFactorBps : collateralFactorBps}
          riskAdjustmentBps={isLimitPreview ? DEMO_BORROW_LIMIT.riskAdjustmentBps : riskAdjustmentBps}
          effectiveCapacity={isLimitPreview ? DEMO_BORROW_LIMIT.effectiveCapacity : effectiveCapacity}
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
            disabled={isLimitPreview || !isReady || !canSubmit || submitting || isReadOnly}
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
            {isLimitPreview
              ? "Demo preview only — no transaction sent"
              : isReadOnly
              ? "Read-only view — connect a wallet to submit"
              : canSubmit
              ? "Borrow"
              : "Preview only — adjust amount"}
          </button>
        )}
        <TransactionStatus status={tx.status} hash={tx.hash} message={tx.message} />
      </div>
    </div>
  );
}
