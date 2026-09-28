"use client";

import { useState } from "react";
import { useReadContract } from "wagmi";
import { LENDING_ADAPTER, BORROW_TOKEN, ONE, formatUnits18, toTokenAmountRoundUp } from "@/lib/contracts";
import { useEffectiveAddress } from "@/lib/useEffectiveAddress";
import { useTransactionFlow } from "@/lib/useTransactionFlow";
import { TransactionStatus } from "./TransactionStatus";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

/// Self-service debt repayment -- LedgerLineLendingAdapter.repay()
/// (contracts/src/LedgerLineLendingAdapter.sol:258). Unlike
/// borrow/withdraw/transfer, repay() never calls Policy.canExecute():
/// paying down your own debt is always available regardless of
/// lifecycle or policy state, by design. This mirrors LiquidateForm's
/// approve-then-execute pattern (repay also pulls the real-decimals
/// borrow token via safeTransferFrom), but for the borrower's own
/// position rather than a third party's.
export function RepayForm() {
  const { address, isReadOnly } = useEffectiveAddress();
  const [amount, setAmount] = useState("");
  const parsedAmount = amount && Number.isFinite(Number(amount))
    ? BigInt(Math.max(0, Math.floor(Number(amount)))) * ONE
    : 0n;

  const { data: debt } = useReadContract({
    address: LENDING_ADAPTER.address,
    abi: LENDING_ADAPTER.abi,
    functionName: "debt",
    args: [address ?? ZERO_ADDRESS],
    query: { enabled: !!address, retry: 2 },
  }) as { data: bigint | undefined };

  const { data: borrowTokenDecimals } = useReadContract({
    address: LENDING_ADAPTER.address,
    abi: LENDING_ADAPTER.abi,
    functionName: "borrowTokenDecimals",
  }) as { data: number | undefined };

  const hasDebt = !!debt && debt > 0n;
  const exceedsDebt = parsedAmount > 0n && !!debt && parsedAmount > debt;

  const requiredUsdg =
    parsedAmount > 0n && borrowTokenDecimals !== undefined
      ? toTokenAmountRoundUp(parsedAmount, borrowTokenDecimals)
      : 0n;

  const approveTx = useTransactionFlow();
  const repayTx = useTransactionFlow();
  const submitting = repayTx.status === "wallet-confirmation" || repayTx.status === "pending";

  const approveDisabled =
    !address || isReadOnly || requiredUsdg === 0n ||
    approveTx.status === "wallet-confirmation" || approveTx.status === "pending";
  const repayDisabled =
    !address || isReadOnly || !hasDebt || parsedAmount === 0n || exceedsDebt || submitting;

  return (
    <div className="form-card">
      <div className="form-card-title">Repay Debt</div>
      <p className="field-hint mb-3 mt-0">
        Always available -- repaying your own debt isn&apos;t gated by policy or lifecycle state.
      </p>
      <div className="mb-3 space-y-2 rounded-[.75rem] border border-terminal-border bg-terminal-surface2 p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-terminal-muted">Outstanding debt</span>
          <span className="font-mono tabular-nums">${formatUnits18(debt)}</span>
        </div>
      </div>
      {!address ? (
        <p className="text-sm text-terminal-muted">Connect a wallet to repay your debt.</p>
      ) : !hasDebt ? (
        <p className="text-sm text-terminal-muted">No outstanding debt -- nothing to repay.</p>
      ) : (
        <>
          <label htmlFor="repay-amount" className="field-label">
            Repay amount (USD, of ${formatUnits18(debt)} debt)
          </label>
          <input
            id="repay-amount"
            type="number"
            min="0"
            step="1"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            aria-describedby="repay-help"
            className="field-input mb-1"
          />
          {exceedsDebt && (
            <div id="repay-help" className="field-error">
              Exceeds outstanding debt
            </div>
          )}
          <div className="mt-3 flex gap-2">
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
            {repayTx.status === "wrong-network" ? (
              <button onClick={repayTx.switchToCorrectNetwork} className="form-action form-action-primary flex-1">
                Switch Network
              </button>
            ) : (
              <button
                disabled={repayDisabled}
                onClick={() =>
                  repayTx.execute({
                    address: LENDING_ADAPTER.address,
                    abi: LENDING_ADAPTER.abi,
                    functionName: "repay",
                    args: [parsedAmount],
                  })
                }
                className="form-action form-action-primary flex-1"
              >
                {isReadOnly ? "Read-only view — connect a wallet to submit" : "Repay"}
              </button>
            )}
          </div>
          <TransactionStatus status={approveTx.status} hash={approveTx.hash} message={approveTx.message} />
          <TransactionStatus status={repayTx.status} hash={repayTx.hash} message={repayTx.message} />
        </>
      )}
    </div>
  );
}
