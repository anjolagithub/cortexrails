"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { config } from "@/lib/wagmi";
import { useState } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
  // Global RPC resilience: a single flaky read (dropped connection,
  // rate-limited RPC, etc.) retries a couple of times with backoff
  // instead of taking down whichever panel happened to be reading it,
  // and a stale response isn't silently trusted forever. Individual
  // reads that need different behavior (e.g. the frozen $1,001 borrow
  // demo preview, which must never hit the network at all) opt out via their
  // own `query: { enabled: false }` / `retry` as before -- this only
  // sets the default the rest of the app already relied on implicitly.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 2,
            retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
            staleTime: 5_000,
          },
        },
      })
  );
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
