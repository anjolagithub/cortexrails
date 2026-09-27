"use client";

import { useState } from "react";
import Link from "next/link";
import { useReadContract } from "wagmi";
import { ASSET_ID, ONE, REGISTRY, STOCK_TOKEN, formatUnits18, bpsToPercent, LIFECYCLE_LABELS } from "@/lib/contracts";
import { EXPLORER_TX_BASE_URL, describeRow, formatRelativeTime } from "@/lib/activity";
import { useActivityRows } from "@/lib/useActivityRows";
import { useEffectiveAddress } from "@/lib/useEffectiveAddress";
import { useDemoScenario } from "@/lib/demoScenarios";
import { ConnectButton } from "./ConnectButton";
import { DepositForm } from "./DepositForm";
import { BorrowForm } from "./BorrowForm";
import { WithdrawForm } from "./WithdrawForm";
import { TransferForm } from "./TransferForm";
import { LiquidateForm } from "./LiquidateForm";
import { DemoModeBanner } from "./DemoModeBanner";

export function PolicyConsole() {
  const { address, isReadOnly, viewAsError } = useEffectiveAddress();
  const demoScenario = useDemoScenario();
  const [operatorMode, setOperatorMode] = useState(false);
  const [demoLifecycle, setDemoLifecycle] = useState<number | undefined>();
  const positionId = address ? BigInt(address) : 0n;
  const { data: state } = useReadContract({ address: REGISTRY.address, abi: REGISTRY.abi, functionName: "getAssetState", args: [ASSET_ID] }) as { data: { price: bigint; lifecycle: number; collateralFactorBps: bigint; riskAdjustmentBps: bigint } | undefined };
  const { data: position } = useReadContract({ address: REGISTRY.address, abi: REGISTRY.abi, functionName: "getPosition", args: [ASSET_ID, positionId], query: { enabled: !!address } }) as { data: { rawBalance: bigint } | undefined };
  const { data: symbol } = useReadContract({ address: STOCK_TOKEN.address, abi: STOCK_TOKEN.abi, functionName: "symbol" }) as { data: string | undefined };
  const { rows: activityRows, loading: activityLoading, error: activityError } = useActivityRows();
  const recentActivity = activityRows.slice(0, 5);
  const lifecycle = demoLifecycle ?? state?.lifecycle;
  const positionValue = position && state ? (position.rawBalance * state.price) / ONE : undefined;
  const capacity = state && positionValue !== undefined ? (positionValue * state.collateralFactorBps * state.riskAdjustmentBps) / 100000000n : undefined;
  const displayLifecycle = lifecycle === undefined ? "—" : LIFECYCLE_LABELS[lifecycle];

  return <section id="policy-console" className="console-shell scroll-mt-24 border border-terminal-border bg-terminal-surface p-5 md:p-7" aria-labelledby="policy-console-title">
    <div className="mb-7 flex flex-col gap-4 border-b border-terminal-border pb-5 sm:flex-row sm:items-start sm:justify-between"><div><p className="eyebrow">Policy evaluation</p><h2 id="policy-console-title" className="mt-2 text-2xl font-semibold tracking-tight">Policy Console</h2><p className="mt-2 max-w-xl text-sm text-terminal-muted">Read live from the deployed Registry and Policy before any financial action executes.</p></div><ConnectButton /></div>
    {viewAsError && <p className="mb-6 rounded-[.6rem] border border-decision-block/30 bg-decision-block/5 px-3 py-2 font-mono text-[10px] uppercase tracking-[.1em] text-decision-block">The ?viewAs address in the URL isn&apos;t a valid full address — showing no position until it&apos;s corrected or a wallet is connected.</p>}
    {isReadOnly && <p className="mb-6 rounded-[.6rem] border border-decision-review/30 bg-decision-review/5 px-3 py-2 font-mono text-[10px] uppercase tracking-[.1em] text-decision-review">Read-only view of a real position (?viewAs) — every value below is live onchain data; connect a wallet to submit an action.</p>}
    {demoScenario && <DemoModeBanner scenario={demoScenario} />}
    <div className="space-y-6">
      <div className="console-data-grid"><div><span>Asset</span><strong>{symbol ?? "—"}</strong><small>Robinhood Stock Token</small></div><div><span>Lifecycle</span><strong className="text-decision-allow">● {displayLifecycle}</strong><small>Owner-configured on testnet</small></div><div><span>Price</span><strong>${formatUnits18(state?.price)}</strong><small>Position {formatUnits18(position?.rawBalance)} {symbol ?? ""}</small></div><div><span>Position value</span><strong>${formatUnits18(positionValue)}</strong><small>Collateral factor {bpsToPercent(state?.collateralFactorBps)}</small></div></div>
      <DepositForm />
      <div className="flex items-center justify-between border-t border-terminal-border pt-4"><button type="button" className="font-mono text-[10px] uppercase tracking-[.12em] text-terminal-muted underline-offset-4 hover:text-terminal-text hover:underline" onClick={() => setOperatorMode((value) => !value)} aria-expanded={operatorMode}>Operator mode {operatorMode ? "−" : "+"}</button>{operatorMode && <select aria-label="Change demo lifecycle" value={demoLifecycle ?? lifecycle ?? 0} onChange={(e) => setDemoLifecycle(Number(e.target.value))} className="select-field w-auto"><option value="0">ACTIVE</option><option value="1">RESTRICTED</option><option value="2">CORPORATE ACTION</option><option value="3">SUSPENDED</option><option value="4">MATURING</option></select>}</div>
      {operatorMode && demoLifecycle !== undefined && demoLifecycle !== state?.lifecycle && <p className="rounded-[.6rem] border border-decision-limit/30 bg-decision-limit/5 px-3 py-2 font-mono text-[10px] text-decision-limit">Local preview only — the onchain lifecycle is still {state ? LIFECYCLE_LABELS[state.lifecycle] : "—"}. Only the Registry owner can transition it.</p>}
      <div className="grid gap-7 xl:grid-cols-3">
        <div className="decision-panel border border-terminal-border bg-terminal-bg p-5" aria-live="polite"><div className="mb-7 flex items-center justify-between"><span className="eyebrow">Policy decision · Borrow</span><span className="font-mono text-[10px] text-terminal-muted">canExecute()</span></div><BorrowForm positionValue={positionValue} collateralFactorBps={state?.collateralFactorBps} riskAdjustmentBps={state?.riskAdjustmentBps} effectiveCapacity={capacity} lifecycle={lifecycle} demoOverride={demoScenario === "borrow-limit" ? { kind: "borrow-limit" } : demoScenario === "borrow-allow" ? { kind: "borrow-allow" } : undefined} /></div>
        <div className="decision-panel border border-terminal-border bg-terminal-bg p-5" aria-live="polite"><div className="mb-7 flex items-center justify-between"><span className="eyebrow">Policy decision · Withdraw</span><span className="font-mono text-[10px] text-terminal-muted">withdraw()</span></div><WithdrawForm positionRawBalance={position?.rawBalance} symbol={symbol} lifecycle={lifecycle} isReadOnly={isReadOnly} isDemoPreview={demoScenario === "withdraw"} /></div>
        <div className="decision-panel border border-terminal-border bg-terminal-bg p-5" aria-live="polite"><div className="mb-7 flex items-center justify-between"><span className="eyebrow">Policy decision · Transfer</span><span className="font-mono text-[10px] text-terminal-muted">transfer()</span></div><TransferForm positionRawBalance={position?.rawBalance} symbol={symbol} lifecycle={lifecycle} isDemoBlockPreview={demoScenario === "transfer-block"} /></div>
      </div>
      <div className="decision-panel border border-terminal-border bg-terminal-bg p-5" aria-live="polite"><div className="mb-7 flex items-center justify-between"><span className="eyebrow">Policy decision · Liquidate</span><span className="font-mono text-[10px] text-terminal-muted">liquidate()</span></div><LiquidateForm demoPresetBorrower={demoScenario === "liquidation" ? process.env.NEXT_PUBLIC_DEMO_LIQUIDATABLE_BORROWER : undefined} /></div>
    </div>
    <div className="mt-7 border-t border-terminal-border pt-5">
      <div className="flex items-center justify-between">
        <h3 className="eyebrow">Recent activity</h3>
        <span className="font-mono text-[10px] text-terminal-muted">ONCHAIN EVENTS</span>
      </div>
      {activityLoading && <p className="mt-3 text-sm text-terminal-muted">Loading activity…</p>}
      {activityError && <p className="mt-3 text-sm text-decision-block">{activityError}</p>}
      {!activityLoading && !activityError && recentActivity.length === 0 && (
        <p className="mt-3 text-sm text-terminal-muted">No activity recorded yet. Policy evaluations and confirmed transactions will appear here.</p>
      )}
      {!activityLoading && !activityError && recentActivity.length > 0 && (
        <ul className="mt-3 divide-y divide-terminal-border">
          {recentActivity.map((row) => {
            const { label, amountText, detailText } = describeRow(row, symbol ?? "TSLA");
            return (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                <div className="flex items-center gap-2 font-mono">
                  <span className="text-terminal-text">{label}</span>
                  {amountText && <span className="text-terminal-muted">{amountText}</span>}
                  {detailText && <span className="text-xs text-terminal-muted">{detailText}</span>}
                </div>
                <div className="flex items-center gap-3 font-mono text-[10px] text-terminal-muted">
                  <span>{formatRelativeTime(row.timestamp)}</span>
                  <a href={`${EXPLORER_TX_BASE_URL}/${row.txHash}`} target="_blank" rel="noreferrer" className="text-terminal-accent hover:underline">
                    Explorer
                  </a>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <Link href="/app/activity" className="mt-3 inline-block font-mono text-[10px] uppercase tracking-[.12em] text-terminal-accent hover:underline">
        View all activity →
      </Link>
    </div>
  </section>;
}
