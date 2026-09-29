"use client";

import { useEffect, useState } from "react";
import { usePublicClient, useWatchContractEvent } from "wagmi";
import { REGISTRY, LENDING_ADAPTER, VAULT_ADAPTER, TRANSFER_ADAPTER, LIQUIDATION_ADAPTER } from "./contracts";
import {
  type ActivityRow,
  LENDING_ADAPTER_DEPLOY_BLOCK,
  REGISTRY_DEPLOY_BLOCK,
  VAULT_ADAPTER_DEPLOY_BLOCK,
  TRANSFER_ADAPTER_DEPLOY_BLOCK,
  LIQUIDATION_ADAPTER_DEPLOY_BLOCK,
  pickEvents,
  sortRowsDesc,
  toActivityRow,
} from "./activity";

function mergeRows(existing: ActivityRow[], incoming: ActivityRow[]): ActivityRow[] {
  const byId = new Map(existing.map((row) => [row.id, row]));
  for (const row of incoming) byId.set(row.id, row);
  return sortRowsDesc(Array.from(byId.values()));
}

/// Shared onchain-activity read: historical backfill (getLogs from each
/// contract's deploy block) plus live-tailing (useWatchContractEvent),
/// across LendingAdapter/VaultAdapter/TransferAdapter/Registry -- the same
/// events ActivityLog.tsx has always read, plus Repaid. Extracted out of that
/// component so PolicyConsole's "Recent activity" summary and the full
/// /app/activity page read the SAME data through the SAME logic, rather
/// than a second, separately-maintained (and previously nonexistent)
/// implementation drifting from this one.
export function useActivityRows() {
  const publicClient = usePublicClient();
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    if (!publicClient) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(undefined);
      try {
        const [lendingLogs, vaultLogs, transferLogs, liquidationLogs, registryLogs] = await Promise.all([
          publicClient.getLogs({
            address: LENDING_ADAPTER.address,
            events: pickEvents(LENDING_ADAPTER.abi, ["Deposited", "Borrowed", "Repaid"]),
            fromBlock: LENDING_ADAPTER_DEPLOY_BLOCK,
            toBlock: "latest",
          }),
          publicClient.getLogs({
            address: VAULT_ADAPTER.address,
            events: pickEvents(VAULT_ADAPTER.abi, ["Withdrawn"]),
            fromBlock: VAULT_ADAPTER_DEPLOY_BLOCK,
            toBlock: "latest",
          }),
          publicClient.getLogs({
            address: TRANSFER_ADAPTER.address,
            events: pickEvents(TRANSFER_ADAPTER.abi, ["Transferred"]),
            fromBlock: TRANSFER_ADAPTER_DEPLOY_BLOCK,
            toBlock: "latest",
          }),
          publicClient.getLogs({
            address: LIQUIDATION_ADAPTER.address,
            events: pickEvents(LIQUIDATION_ADAPTER.abi, ["Liquidated"]),
            fromBlock: LIQUIDATION_ADAPTER_DEPLOY_BLOCK,
            toBlock: "latest",
          }),
          publicClient.getLogs({
            address: REGISTRY.address,
            events: pickEvents(REGISTRY.abi, ["LifecycleTransitioned", "AssetParametersUpdated"]),
            fromBlock: REGISTRY_DEPLOY_BLOCK,
            toBlock: "latest",
          }),
        ]);

        const allLogs = [...lendingLogs, ...vaultLogs, ...transferLogs, ...liquidationLogs, ...registryLogs];
        const uniqueBlockNumbers = Array.from(new Set(allLogs.map((log) => log.blockNumber))).filter(
          (blockNumber): blockNumber is bigint => blockNumber !== null
        );
        const blocks = await Promise.all(
          uniqueBlockNumbers.map((blockNumber) => publicClient.getBlock({ blockNumber }))
        );
        const timestampByBlock = new Map(blocks.map((block) => [block.number, block.timestamp]));

        // biome-ignore lint: getLogs' return type for a multi-event `events` array
        // doesn't narrow eventName/args per-entry; decoding is driven by the
        // real ABI values passed in, so this is safe at runtime.
        const nextRows = allLogs
          .map((log) =>
            toActivityRow(log as never, log.blockNumber ? timestampByBlock.get(log.blockNumber) : undefined)
          )
          .filter((row): row is ActivityRow => row !== undefined);

        if (!cancelled) {
          setRows(sortRowsDesc(nextRows));
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load activity");
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [publicClient]);

  async function appendLiveLogs(logs: unknown[]) {
    if (!publicClient) return;
    const decoded = logs as {
      eventName?: string;
      args?: Record<string, unknown>;
      transactionHash?: `0x${string}` | null;
      blockNumber?: bigint | null;
      logIndex?: number | null;
    }[];

    const blockNumbers = Array.from(new Set(decoded.map((log) => log.blockNumber))).filter(
      (blockNumber): blockNumber is bigint => !!blockNumber
    );
    const blocks = await Promise.all(
      blockNumbers.map((blockNumber) => publicClient.getBlock({ blockNumber }))
    );
    const timestampByBlock = new Map(blocks.map((block) => [block.number, block.timestamp]));

    const newRows = decoded
      .map((log) => toActivityRow(log, log.blockNumber ? timestampByBlock.get(log.blockNumber) : undefined))
      .filter((row): row is ActivityRow => row !== undefined);

    if (newRows.length > 0) setRows((prev) => mergeRows(prev, newRows));
  }

  useWatchContractEvent({
    address: LENDING_ADAPTER.address,
    abi: LENDING_ADAPTER.abi,
    eventName: "Deposited",
    onLogs: appendLiveLogs,
  });
  useWatchContractEvent({
    address: LENDING_ADAPTER.address,
    abi: LENDING_ADAPTER.abi,
    eventName: "Borrowed",
    onLogs: appendLiveLogs,
  });
  useWatchContractEvent({
    address: LENDING_ADAPTER.address,
    abi: LENDING_ADAPTER.abi,
    eventName: "Repaid",
    onLogs: appendLiveLogs,
  });
  useWatchContractEvent({
    address: VAULT_ADAPTER.address,
    abi: VAULT_ADAPTER.abi,
    eventName: "Withdrawn",
    onLogs: appendLiveLogs,
  });
  useWatchContractEvent({
    address: TRANSFER_ADAPTER.address,
    abi: TRANSFER_ADAPTER.abi,
    eventName: "Transferred",
    onLogs: appendLiveLogs,
  });
  useWatchContractEvent({
    address: LIQUIDATION_ADAPTER.address,
    abi: LIQUIDATION_ADAPTER.abi,
    eventName: "Liquidated",
    onLogs: appendLiveLogs,
  });
  useWatchContractEvent({
    address: REGISTRY.address,
    abi: REGISTRY.abi,
    eventName: "LifecycleTransitioned",
    onLogs: appendLiveLogs,
  });
  useWatchContractEvent({
    address: REGISTRY.address,
    abi: REGISTRY.abi,
    eventName: "AssetParametersUpdated",
    onLogs: appendLiveLogs,
  });

  return { rows, loading, error };
}
