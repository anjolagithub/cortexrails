import type { Abi, AbiEvent, Address } from "viem";
import { formatUnits18, bpsToPercent, LIFECYCLE_LABELS } from "./contracts";

// Deploy block numbers for the live V2 testnet deployment, read directly
// from contracts/broadcast/DeployTestnetRealV2.s.sol/46630/run-latest.json.
// These are tied to that specific deployment -- re-derive from a fresh
// broadcast file if the contracts are ever redeployed.
export const REGISTRY_DEPLOY_BLOCK = 122446927n;
export const LENDING_ADAPTER_DEPLOY_BLOCK = 122446946n;

// NOT the deploy block of the current VAULT_ADAPTER.address. That address
// is the debt-safety-fixed instance redeployed by
// contracts/script/RedeployVaultAdapter.s.sol (commit 9fa2c38), which has
// no broadcast log anywhere in this repo (see docs/DEPLOYMENTS.md) -- its
// real deploy block is genuinely unrecorded, not just unfetched here. This
// value is the ABANDONED pre-fix instance's deploy block instead, kept
// deliberately as a safe (if not tight) lower bound: getLogs against the
// current address starting from a block before that address had any code
// simply returns nothing for the gap, so this stays correct, just less
// efficient than the real deploy block would be. Replace with the actual
// value if RedeployVaultAdapter.s.sol's broadcast log ever becomes available.
export const VAULT_ADAPTER_DEPLOY_BLOCK = 122446953n;

// Unlike VAULT_ADAPTER_DEPLOY_BLOCK above, this one is genuinely correct:
// read directly from
// contracts/broadcast/DeployTransferAdapter.s.sol/46630/run-latest.json,
// the actual deploy block of the current, only-ever TRANSFER_ADAPTER.address.
export const TRANSFER_ADAPTER_DEPLOY_BLOCK = 123081162n;

// LedgerLineLiquidationAdapter is a brand-new contract (no prior
// address to have scanned from too early, unlike the other three
// adapters above) -- read directly from the real deploy tx's block,
// contracts/broadcast/DeployLiquidationAdapter.s.sol/46630/run-latest.json.
export const LIQUIDATION_ADAPTER_DEPLOY_BLOCK = 124662488n;

export const EXPLORER_TX_BASE_URL = "https://explorer.testnet.chain.robinhood.com/tx";

/// Extracts just the named event ABI items from a contract's full ABI,
/// for use with getLogs/watchContractEvent -- avoids hand-typing event
/// signatures that could drift from the real, committed ABI.
export function pickEvents(abi: Abi, names: string[]): AbiEvent[] {
  return (abi as AbiEvent[]).filter(
    (item) => item.type === "event" && names.includes(item.name)
  );
}

export type ActivityKind = "deposit" | "borrow" | "repay" | "withdraw" | "transfer" | "liquidate" | "lifecycle" | "parameters";

// Raw decoded fields only -- no display strings are baked in here, so
// formatting (which depends on the live-read stock symbol) always
// happens at render time against current data.
export type ActivityRow = {
  id: string;
  kind: ActivityKind;
  txHash: `0x${string}`;
  blockNumber: bigint;
  logIndex: number;
  timestamp: bigint | undefined;
  user?: Address;
  to?: Address;
  amount?: bigint;
  lifecycleFrom?: number;
  lifecycleTo?: number;
  price?: bigint;
  collateralFactorBps?: bigint;
  riskAdjustmentBps?: bigint;
  liquidator?: Address;
  seizeAmount?: bigint;
  debtAtLiquidation?: bigint;
};

type DecodedLog = {
  eventName?: string;
  args?: Record<string, unknown>;
  transactionHash?: `0x${string}` | null;
  blockNumber?: bigint | null;
  logIndex?: number | null;
};

/// Converts one decoded event log into a row of raw fields. Returns
/// undefined for anything that isn't one of the six known events --
/// nothing here is invented, only what the contracts actually emit.
export function toActivityRow(log: DecodedLog, timestamp: bigint | undefined): ActivityRow | undefined {
  const txHash = log.transactionHash;
  const blockNumber = log.blockNumber;
  const logIndex = log.logIndex;
  if (!txHash || blockNumber === null || blockNumber === undefined || logIndex === null || logIndex === undefined) {
    return undefined;
  }

  const id = `${txHash}-${logIndex}`;
  const args = log.args ?? {};
  const base = { id, txHash, blockNumber, logIndex, timestamp };

  switch (log.eventName) {
    case "Deposited":
      return { ...base, kind: "deposit", user: args.user as Address, amount: args.amount as bigint };
    case "Borrowed":
      return { ...base, kind: "borrow", user: args.user as Address, amount: args.amount as bigint };
    case "Repaid":
      return { ...base, kind: "repay", user: args.user as Address, amount: args.amount as bigint };
    case "Withdrawn":
      return { ...base, kind: "withdraw", user: args.user as Address, amount: args.amount as bigint };
    case "Transferred":
      return {
        ...base,
        kind: "transfer",
        user: args.from as Address,
        to: args.to as Address,
        amount: args.amount as bigint,
      };
    case "Liquidated":
      // Emitted by LedgerLineLiquidationAdapter (not LendingAdapter's own
      // internal Liquidated event, which fires in the same tx but carries
      // repayer/seizure bookkeeping fields, not the debtAtLiquidation
      // figure this one adds) -- see
      // contracts/src/LedgerLineLiquidationAdapter.sol.
      return {
        ...base,
        kind: "liquidate",
        user: args.borrower as Address,
        liquidator: args.liquidator as Address,
        amount: args.repayAmount as bigint,
        seizeAmount: args.seizeAmount as bigint,
        debtAtLiquidation: args.debtAtLiquidation as bigint,
      };
    case "LifecycleTransitioned":
      return { ...base, kind: "lifecycle", lifecycleFrom: Number(args.from), lifecycleTo: Number(args.to) };
    case "AssetParametersUpdated":
      return {
        ...base,
        kind: "parameters",
        price: args.price as bigint,
        collateralFactorBps: args.collateralFactorBps as bigint,
        riskAdjustmentBps: args.riskAdjustmentBps as bigint,
      };
    default:
      return undefined;
  }
}

export function sortRowsDesc(rows: ActivityRow[]): ActivityRow[] {
  return [...rows].sort((a, b) => {
    if (a.blockNumber !== b.blockNumber) return a.blockNumber > b.blockNumber ? -1 : 1;
    return b.logIndex - a.logIndex;
  });
}

const KIND_LABELS: Record<ActivityKind, string> = {
  deposit: "Deposit",
  borrow: "Borrow",
  repay: "Repay",
  withdraw: "Withdraw",
  transfer: "Transfer",
  liquidate: "Liquidate",
  lifecycle: "Lifecycle Change",
  parameters: "Parameters Updated",
};

/// Render-time formatting -- kept separate from decoding so it always
/// reflects the current (live-read) stock token symbol.
export function describeRow(row: ActivityRow, stockSymbol: string): { label: string; amountText?: string; detailText?: string } {
  const label = KIND_LABELS[row.kind];

  switch (row.kind) {
    case "deposit":
    case "withdraw":
      return { label, amountText: `${formatUnits18(row.amount)} ${stockSymbol}` };
    case "transfer":
      // No tokens move for a transfer -- amount is still denominated in
      // the collateral token's shares (rawBalance reassigned between
      // positionIds), same unit as deposit/withdraw's amountText above.
      return {
        label,
        amountText: `${formatUnits18(row.amount)} ${stockSymbol}`,
        detailText: row.to ? `To ${row.to.slice(0, 6)}...${row.to.slice(-4)}` : undefined,
      };
    case "liquidate":
      // repayAmount and seizeAmount are both 18-decimal internal units
      // (dollar-notional debt repaid, and collateral shares seized) --
      // same convention as borrow's amount and deposit/withdraw's
      // amount, respectively.
      return {
        label,
        amountText: `$${formatUnits18(row.amount)} repaid / ${formatUnits18(row.seizeAmount)} ${stockSymbol} seized`,
        detailText: row.liquidator ? `By ${row.liquidator.slice(0, 6)}...${row.liquidator.slice(-4)}` : undefined,
      };
    case "borrow":
      // NOTE: the contract's emitted `amount` is the 18-decimal internal
      // accounting value (dollar-notional), NOT the real 6-decimal USDG
      // token amount actually transferred -- see LedgerLineLendingAdapter
      // .sol's DECIMAL HANDLING doc comment and borrow()'s emit line.
      // Scaling to real USDG decimals happens only in the final
      // safeTransfer, which isn't what's emitted here. Formatted as a
      // dollar figure to match how the rest of the app (capacity,
      // position value) displays this same unit.
      return { label, amountText: `$${formatUnits18(row.amount)}` };
    case "repay":
      // Same 18-decimal internal dollar-notional convention as borrow's
      // amount above -- repay() takes that same unit as its argument
      // (see LedgerLineLendingAdapter.sol:258), so it's formatted the
      // same way here.
      return { label, amountText: `$${formatUnits18(row.amount)}` };
    case "lifecycle":
      return {
        label,
        detailText: `${LIFECYCLE_LABELS[row.lifecycleFrom ?? -1] ?? "?"} → ${LIFECYCLE_LABELS[row.lifecycleTo ?? -1] ?? "?"}`,
      };
    case "parameters":
      return {
        label,
        detailText: `Price $${formatUnits18(row.price)} · Collateral ${bpsToPercent(row.collateralFactorBps)} · Risk adj ${bpsToPercent(row.riskAdjustmentBps)}`,
      };
  }
}

export function formatRelativeTime(timestamp: bigint | undefined): string {
  if (timestamp === undefined) return "—";
  const seconds = Math.floor(Date.now() / 1000) - Number(timestamp);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
