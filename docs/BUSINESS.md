# CortexRails: business model and go-to-market

> Status: planned model. No external protocol integrates CortexRails
> yet (see the README's Roadmap). This document describes who we expect
> to pay, why, and how we intend to reach them.

## The problem we sell against

Tokenized stocks behave differently from crypto collateral, and lending
markets built for crypto don't model those differences:

- **Markets close.** The underlying exchange shuts nights, weekends and
  holidays while onchain markets keep running. A stale weekend price can
  trigger liquidations that shouldn't happen, or allow borrowing that
  shouldn't be allowed.
- **Assets have a lifecycle.** Trading halts, corporate actions and
  restrictions change what is safe to do with a position.
- **Every protocol rebuilds this logic inline,** inside the contract that
  holds the funds, where it's hard to audit and can't be reused.

## Who pays

| Customer | Why they pay |
|---|---|
| **Lending and vault protocols** listing tokenized stocks (first: markets on Robinhood Chain) | They get equity-aware risk rules without writing and auditing their own |
| **Risk curators** running lending markets (e.g. curated Morpho-style markets) | Curators carry the reputational risk of bad liquidations; CortexRails enforces their policy onchain, with a clear reason code for every decision |
| **Agent and wallet builders** moving funds autonomously | A deterministic ALLOW / LIMIT / REVIEW / BLOCK check before any action an agent takes |

## How we plan to charge

1. **Integration licence:** a flat monthly fee per integrated protocol,
   covering policy configuration and support.
2. **Usage fee:** a small fee per policy-checked action (or a share of
   volume) once an integration is live.

Open-source core, paid hosted policy configuration and monitoring.

## First customers we're targeting

1. Teams building lending or vault products on Robinhood Chain.
2. Curators of tokenized-stock lending markets on other chains.
3. Agent frameworks that need a spending guardrail.

Near-term goal: 2–3 design partners calling `canExecute()` from their
own contracts, the real test named in Roadmap item 2.

## Market-closed safety

CortexRails already models asset lifecycle states (RESTRICTED,
CORPORATE_ACTION, SUSPENDED, MATURING). In any non-ACTIVE state the
policy returns BLOCK for every action, so a halted or closed market
can't be borrowed against, withdrawn, transferred or liquidated on a
bad price.

- **Live today:** lifecycle transitions are made by the Registry owner.
- **Built, not yet in the live decision path:**
  `RobinhoodStockTokenAdapter` rejects stale prices and honours the
  token's oracle-paused flag where implemented.
- **Next step:** drive lifecycle transitions automatically from feed
  staleness and market-hours calendars, so markets move to a safe state
  when the underlying exchange closes, with no manual action needed.
