"use client";

import { useState } from "react";
import { useReadContract } from "wagmi";
import { STOCK_TOKEN } from "@/lib/contracts";
import { type ActivityKind, type ActivityRow, EXPLORER_TX_BASE_URL, describeRow, formatRelativeTime } from "@/lib/activity";
import { useActivityRows } from "@/lib/useActivityRows";

type FilterId = "all" | "deposit" | "borrow" | "withdraw" | "transfer" | "lifecycle";

const TABS: { id: FilterId; label: string }[] = [
  { id: "all", label: "All" },
  { id: "deposit", label: "Deposits" },
  { id: "borrow", label: "Borrows" },
  { id: "withdraw", label: "Withdrawals" },
  { id: "transfer", label: "Transfers" },
  { id: "lifecycle", label: "Lifecycle" },
];

const ACTION_KINDS: ActivityKind[] = ["deposit", "borrow", "withdraw", "transfer"];

function matchesFilter(row: ActivityRow, filter: FilterId): boolean {
  if (filter === "all") return true;
  if (filter === "lifecycle") return row.kind === "lifecycle" || row.kind === "parameters";
  return row.kind === filter;
}

export function ActivityLog() {
  const { data: symbol } = useReadContract({
    address: STOCK_TOKEN.address,
    abi: STOCK_TOKEN.abi,
    functionName: "symbol",
  }) as { data: string | undefined };
  const stockSymbol = symbol ?? "TSLA";

  const { rows, loading, error: loadError } = useActivityRows();
  const [filter, setFilter] = useState<FilterId>("all");

  const visibleRows = rows.filter((row) => matchesFilter(row, filter));

  return (
    <section className="console-shell border border-terminal-border bg-terminal-surface p-5 md:p-7" aria-labelledby="activity-title">
      <div className="mb-6 flex flex-col gap-4 border-b border-terminal-border pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="eyebrow">Onchain activity</p>
          <h2 id="activity-title" className="mt-2 text-2xl font-semibold tracking-tight">Activity</h2>
          <p className="mt-2 max-w-xl text-sm text-terminal-muted">
            Deposited, Borrowed, Repaid, Withdrawn, Transferred, and Registry state changes, read directly from onchain logs.
          </p>
        </div>
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setFilter(tab.id)}
            aria-pressed={filter === tab.id}
            className={`rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[.1em] transition-colors ${
              filter === tab.id
                ? "border-terminal-accent bg-terminal-accent text-terminal-accent-fg"
                : "border-terminal-border text-terminal-muted hover:text-terminal-text"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <p className="mb-5 text-xs text-terminal-muted">
        Only successful onchain actions appear here. A LIMIT or BLOCK policy decision reverts the whole
        transaction, so rejected attempts leave no onchain record to read.
      </p>

      {loading && <div className="border border-terminal-border bg-terminal-bg px-4 py-4 text-sm text-terminal-muted" role="status">Loading activity…</div>}
      {loadError && <div className="border border-terminal-border bg-terminal-bg px-4 py-4 text-sm text-decision-block" role="alert">{loadError}</div>}

      {!loading && !loadError && visibleRows.length === 0 && (
        <div className="border border-terminal-border bg-terminal-bg px-4 py-4 text-sm text-terminal-muted">
          No activity recorded yet for this filter.
        </div>
      )}

      {!loading && !loadError && visibleRows.length > 0 && (
        <ul className="divide-y divide-terminal-border border border-terminal-border bg-terminal-bg">
          {visibleRows.map((row) => {
            const { label, amountText, detailText } = describeRow(row, stockSymbol);
            const isAction = ACTION_KINDS.includes(row.kind);
            return (
              <li key={row.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm text-terminal-text">{label}</span>
                  {isAction && (
                    <span className="rounded-full border border-decision-allow px-2 py-0.5 font-mono text-[9px] uppercase tracking-[.1em] text-decision-allow">
                      Allow
                    </span>
                  )}
                  {amountText && <span className="font-mono text-sm text-terminal-muted">{amountText}</span>}
                  {detailText && <span className="font-mono text-xs text-terminal-muted">{detailText}</span>}
                </div>
                <div className="flex items-center gap-3 font-mono text-[10px] text-terminal-muted">
                  <span>{formatRelativeTime(row.timestamp)}</span>
                  <span>{row.txHash.slice(0, 10)}...{row.txHash.slice(-8)}</span>
                  <a
                    href={`${EXPLORER_TX_BASE_URL}/${row.txHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-terminal-accent hover:underline"
                  >
                    View on Explorer
                  </a>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
