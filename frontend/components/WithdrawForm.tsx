"use client";

import { useState } from "react";
import { VAULT_ADAPTER, ONE, formatUnits18 } from "@/lib/contracts";
import { useTransactionFlow } from "@/lib/useTransactionFlow";
import { TransactionStatus } from "./TransactionStatus";

export function WithdrawForm({
  positionRawBalance,
  symbol,
  lifecycle,
  isReadOnly,
}: {
  positionRawBalance: bigint | undefined;
  symbol: string | undefined;
  lifecycle: number | undefined;
  isReadOnly?: boolean;
}) {
  const [amount, setAmount] = useState("");
  const parsedAmount = amount ? BigInt(Math.floor(Number(amount))) * ONE : 0n;

  const exceedsPosition =
    parsedAmount > 0n && positionRawBalance !== undefined && parsedAmount > positionRawBalance;
  const isActive = lifecycle === 0;

  const tx = useTransactionFlow();
  const submitting = tx.status === "wallet-confirmation" || tx.status === "pending";
  const disabled = !amount || exceedsPosition || !isActive || submitting || isReadOnly;

  return (
    <div className="form-card">
      <div className="form-card-title">Withdraw Stock Token</div>
      <div className="field-hint mb-3 mt-0">
        Position <span className="text-terminal-text">{formatUnits18(positionRawBalance)} {symbol ?? ""}</span>
      </div>
      <label htmlFor="withdraw-amount" className="field-label">
        Shares
      </label>
      <input
        id="withdraw-amount"
        type="number"
        min="0"
        step="1"
        inputMode="decimal"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="0"
        aria-describedby="withdraw-help"
        className="field-input mb-1"
      />
      {exceedsPosition && <div className="field-error">Exceeds your position</div>}
      {!isActive && (
        <div id="withdraw-help" className="field-warn">
          Lifecycle is not ACTIVE — withdrawals are blocked.
        </div>
      )}
      <div className="mt-3">
        {tx.status === "wrong-network" ? (
          <button onClick={tx.switchToCorrectNetwork} className="form-action form-action-primary">
            Switch Network
          </button>
        ) : (
          <button
            disabled={disabled}
            onClick={() =>
              tx.execute({
                address: VAULT_ADAPTER.address,
                abi: VAULT_ADAPTER.abi,
                functionName: "withdraw",
                args: [parsedAmount],
              })
            }
            className="form-action form-action-primary"
          >
            {isReadOnly ? "Read-only view — connect a wallet to submit" : "Withdraw"}
          </button>
        )}
      </div>
      <TransactionStatus status={tx.status} hash={tx.hash} message={tx.message} />
    </div>
  );
}
