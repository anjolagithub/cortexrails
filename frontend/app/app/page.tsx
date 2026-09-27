import Link from "next/link";
import { Suspense } from "react";
import { PolicyConsole } from "@/components/PolicyConsole";
import { AgentDemo } from "@/components/AgentDemo";

export default function Dashboard() {
  return <main className="mx-auto flex max-w-6xl flex-col gap-8 px-5 py-6 md:px-10 md:py-8">
    <header className="flex items-center justify-between border-b border-terminal-border pb-5"><div className="flex min-w-0 items-center gap-4 sm:gap-5"><Link href="/" className="flex items-center gap-2 font-semibold tracking-tight"><span aria-hidden="true" className="text-terminal-accent">←</span><span>CortexRails Protocol</span></Link><nav className="hidden items-center gap-4 border-l border-terminal-border pl-5 font-mono text-[10px] uppercase tracking-[.14em] md:flex" aria-label="App navigation"><Link href="/app" className="text-terminal-text">Policy Console</Link><Link href="/app/activity" className="text-terminal-muted transition-colors hover:text-terminal-text">Activity</Link></nav></div><span className="hidden rounded-full border border-terminal-border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[.14em] text-terminal-muted sm:inline"><span className="mr-1.5 text-decision-allow">●</span>Robinhood Chain · Testnet</span></header>
    <section className="border-b border-terminal-border pb-7"><p className="eyebrow">Core policy engine</p><h1 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight md:text-4xl">Decide before value moves.</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-terminal-muted">Live reads against the deployed CortexRails Policy on Robinhood Chain testnet: asset state, position, risk, and lifecycle decide whether an action is permitted.</p></section>
    <Suspense fallback={<div className="console-shell border border-terminal-border bg-terminal-surface p-5 md:p-7 text-sm text-terminal-muted">Loading policy console…</div>}>
      <PolicyConsole />
    </Suspense>
    <AgentDemo />
    <footer className="border-t border-terminal-border py-5 text-xs text-terminal-muted">CortexRails Protocol · Policy decisions are enforced onchain by the consuming adapter contracts.</footer>
  </main>;
}
