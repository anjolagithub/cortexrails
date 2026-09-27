"use client";

import { useAccount } from "wagmi";
import { useSearchParams } from "next/navigation";
import { isAddress, type Address } from "viem";

/// Resolves the address the Policy Console should read against.
///
/// Normally that's the connected wallet. But every value shown here --
/// position value, capacity, the ALLOW/LIMIT/BLOCK decision -- comes
/// from plain read-only contract calls keyed on an address, not from
/// anything that requires a signature. So a second, explicit path is
/// supported: `?viewAs=0x...` in the URL lets anyone view the exact
/// same real, live panels for a given position with no wallet
/// connection at all.
///
/// This exists specifically so the real product can be recorded or
/// screenshotted (e.g. by an automated demo tool with no wallet
/// extension available) without ever fabricating data -- `viewAs` reads
/// the same real Registry/Policy state a connected wallet would, it
/// just skips the connection step. Submitting a transaction still
/// requires a real connected wallet regardless of `viewAs` --
/// `isReadOnly` below is what gates that.
export function useEffectiveAddress(): {
  address: Address | undefined;
  isConnected: boolean;
  isReadOnly: boolean;
} {
  const { address: connectedAddress, isConnected } = useAccount();
  const searchParams = useSearchParams();
  const viewAsParam = searchParams.get("viewAs");

  if (connectedAddress) {
    return { address: connectedAddress, isConnected: true, isReadOnly: false };
  }

  if (viewAsParam && isAddress(viewAsParam)) {
    return { address: viewAsParam, isConnected: false, isReadOnly: true };
  }

  return { address: undefined, isConnected: false, isReadOnly: false };
}
