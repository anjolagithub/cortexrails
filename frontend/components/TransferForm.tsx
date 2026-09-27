"use client";

import { useState } from "react";
import { useReadContract } from "wagmi";
import { isAddress, type Address } from "viem";
import { LENDING_ADAPTER, TRANSFER_ADAPTER, ONE, formatUnits18 } from "@/lib/contracts";
import { useEffectiveAddress } from "@/lib/useEffectiveAddress";
import { useTransactionFlow } from "@/lib/useTransactionFlow";
import { DEMO_TRANSFER_BLOCK } from "@/lib/demoScenarios";
import { TransactionStatus } from "./TransactionStatus";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

export function TransferForm({
  positionRawBalance,
  symbol,
  lifecycle,
  isDemoBlockPreview,
}: {
  positionRawBalance: bigint | undefined;
  symbol: string | undefined;
  lifecycle: number | undefined;
  isDemoBlockPreview?: boolean;
}) {
  const { address, isReadOnly } = useEffectiveAddress();
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const parsedAmount = amount ? BigInt(Math.floor(Number(amount))) * ONE : 0n;

  // Same debt(address) read TransferAdapter.sol itself checks — shown
  // BEFORE any transaction is attempted, not invented UX logic. Skipped
  // entirely in the transfer-block preview, which shows a fixed,
  // clearly-labeled illustrative debt state instead (see
  // DemoModeBanner) rather than depending on a specific live testnet
  // position actually carrying debt at demo time.
  const { data: existingDebt } = useReadContract({
    address: LENDING_ADAPTER.address,
    abi: LENDING_ADAPTER.abi,
    functionName: "debt",
    args: [address ?? ZERO_ADDRESS],
    query: { enabled: !isDemoBlockPreview && !!address, retry: 2 },
  }) as { data: bigint | undefined };

  const displayPositionRawBalance = isDemoBlockPreview
    ? DEMO_TRANSFER_BLOCK.positionRawBalance
    : positionRawBalance;
  const hasOutstandingDebt = isDemoBlockPreview ? true : !!existingDebt && existingDebt > 0n;
  const recipientEntered = recipient.length > 0;
  const recipientValid = !recipientEntered || isAddress(recipient);
  const exceedsPosition =
    parsedAmount > 0n && displayPositionRawBalance !== undefined && parsedAmount > displayPositionRawBalance;
  const isActive = lifecycle === 0;

  const tx = useTransactionFlow();
  const submitting = tx.status === "wallet-confirmation" || tx.status === "pending";
  const disabled =
    !amount ||
    !recipientEntered ||
    !isAddress(recipient) ||
    exceedsPosition ||
    !isActive ||
    hasOutstandingDebt ||
    submitting ||
    isReadOnly;

  return (
    <div className="form-card">
      <div className="form-card-title">Transfer Position</div>
      <div className="field-hint mb-3 mt-0">
        Position <span className="text-terminal-text">{formatUnits18(displayPositionRawBalance)} {symbol ?? ""}</span>
      </div>
      <label htmlFor="transfer-recipient" className="field-label">
        Recipient address
      </label>
      <input
        id="transfer-recipient"
        type="text"
        value={recipient}
        onChange={(e) => setRecipient(e.target.value)}
        placeholder="0x..."
        aria-describedby="transfer-recipient-help"
        className="field-input mb-1 font-mono"
      />
      {!recipientValid && (
        <div id="transfer-recipient-help" className="field-error">
          Not a valid address
        </div>
      )}
      <label htmlFor="transfer-amount" className="field-label mt-3">
        Shares
      </label>
      <input
        id="transfer-amount"
        type="number"
        min="0"
        step="1"
        inputMode="decimal"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="0"
        aria-describedby="transfer-help"
        className="field-input mb-1"
      />
      {exceedsPosition && <div className="field-error">Exceeds your position</div>}
      {hasOutstandingDebt && (
        <div id="transfer-help" className="field-error">
          Outstanding debt blocks transfer — repay first.
        </div>
      )}
      {!isActive && <div className="field-warn">Lifecycle is not ACTIVE — transfers are blocked.</div>}
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
                address: TRANSFER_ADAPTER.address,
                abi: TRANSFER_ADAPTER.abi,
                functionName: "transfer",
                args: [recipient as Address, parsedAmount],
              })
            }
            className="form-action form-action-primary"
          >
            {isReadOnly ? "Read-only view — connect a wallet to submit" : "Transfer"}
          </button>
        )}
      </div>
      <TransactionStatus status={tx.status} hash={tx.hash} message={tx.message} />
    </div>
  );
}
