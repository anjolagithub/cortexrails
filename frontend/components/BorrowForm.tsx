"use client";

import { useState } from "react";
import { useReadContract } from "wagmi";
import { POLICY, LENDING_ADAPTER, ASSET_ID, ONE } from "@/lib/contracts";
import { useEffectiveAddress } from "@/lib/useEffectiveAddress";
import { useTransactionFlow } from "@/lib/useTransactionFlow";
import { DEMO_BORROW_LIMIT_PREVIEW } from "@/lib/demoScenarios";
import { PolicyEquation } from "./PolicyEquation";
import { PolicyVerdict } from "./PolicyVerdict";
import { TransactionStatus } from "./TransactionStatus";

type BorrowDemoOverride = { kind: "borrow" };

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
  const isBorrowDemo = demoOverride?.kind === "borrow";
  const [amount, setAmount] = useState(() => (isBorrowDemo ? DEMO_BORROW_LIMIT_PREVIEW.amount : ""));

  // Single panel, single URL, no navigation: the frozen illustrative
  // LIMIT preview is shown ONLY while the field still reads exactly
  // "1001" (the preset value). It's derived straight from `amount` on
  // every render -- not a one-time flag set in an effect or onChange --
  // so it can't get stuck out of sync no matter how a browser-automation
  // tool edits the field (clear+type, fill(), paste, etc.). The instant
  // the value differs (e.g. "5"), isFrozenPreview flips off and every
  // line below falls straight through to the exact same live
  // useReadContract(canExecute) / writeContract(borrow) calls LIVE MODE
  // always used -- nothing about that path is touched by demo mode.
  const isFrozenPreview = isBorrowDemo && amount.trim() === DEMO_BORROW_LIMIT_PREVIEW.amount;

  const parsedAmount = amount && Number.isFinite(Number(amount))
    ? BigInt(Math.max(0, Math.floor(Number(amount)))) * ONE
    : 0n;
  const positionId = address ? BigInt(address) : 0n;

  const policyRead = useReadContract({
    address: POLICY.address,
    abi: POLICY.abi,
    functionName: "canExecute",
    args: [ASSET_ID, positionId, 0, parsedAmount], // Action.BORROW = 0
    query: { enabled: !isFrozenPreview && !!address && parsedAmount > 0n, retry: 2 },
  });
  const response = isFrozenPreview
    ? DEMO_BORROW_LIMIT_PREVIEW.response
    : (policyRead.data as { decision: number; permittedAmount: bigint; reason: string } | undefined);
  const isEvaluating = !isFrozenPreview && policyRead.isLoading;
  const evaluationError = !isFrozenPreview && policyRead.error;

  const tx = useTransactionFlow();
  const decisionLabel = response ? ["ALLOW", "LIMIT", "REVIEW", "BLOCK"][response.decision] : undefined;
  // The frozen preview never allows a real submit -- it's illustration
  // only, per "Do not fake a transaction." The moment it's unfrozen
  // (amount changed), canSubmit is driven entirely by the real
  // decisionLabel from the live canExecute response, same as LIVE MODE.
  const canSubmit = !isFrozenPreview && decisionLabel === "ALLOW";
  const hasAmount = parsedAmount > 0n;
  const isReady = isFrozenPreview ? true : !!address && hasAmount && !isEvaluating && !!response;
  const evaluationMessage = isFrozenPreview
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
          positionValue={isFrozenPreview ? DEMO_BORROW_LIMIT_PREVIEW.positionValue : positionValue}
          collateralFactorBps={isFrozenPreview ? DEMO_BORROW_LIMIT_PREVIEW.collateralFactorBps : collateralFactorBps}
          riskAdjustmentBps={isFrozenPreview ? DEMO_BORROW_LIMIT_PREVIEW.riskAdjustmentBps : riskAdjustmentBps}
          effectiveCapacity={isFrozenPreview ? DEMO_BORROW_LIMIT_PREVIEW.effectiveCapacity : effectiveCapacity}
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
            disabled={isFrozenPreview || !isReady || !canSubmit || submitting || isReadOnly}
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
            {isFrozenPreview
              ? "Change the amount to evaluate live — demo preview, no transaction sent"
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
