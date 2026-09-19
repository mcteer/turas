# Public customer evidence

Reviewed 19 September 2026. Version `public-evidence-2026-09-19.1`.

The application contains 147 records: 146 named organizations and one unnamed sportswear retailer. They cover 114 stories across 106 organizations, plus 41 directory-only entries. Sixty organizations appear in the directory logo roster; the Vercel self-logo is excluded. Sources span 3 August 2022 through 15 September 2026.

## Coverage and source of truth

The inventory includes the [official customer directory](https://vercel.com/customers) and every story linked from the [customer archive](https://vercel.com/blog/category/customers), including pages 2–10, at review time. It is not a complete list of all Vercel customers, a CRM export, or verification of current commercial relationships. It includes historical stories and examples of partner or open-source product use. Incidental mentions of an agency's other clients are not automatically treated as Vercel customer records.

The maintained snapshot is `lib/customer-evidence/snapshot.json`, validated by `lib/customer-evidence/repository.ts`. It contains short paraphrases, source URLs, publication dates, workload scope, product references and source cautions. Full article bodies are not distributed. `/customers` and Turi's public evidence tools read this same snapshot. It is deployed with the application; it is not a live scrape or a new Postgres table. Postgres continues to store application sessions, conversation metadata and fictional decisions.

Publication date and review date are separate. The former dates the source's claim; the latter records the snapshot review. Neither is proof that an operational state remains current. An organization mentioned only by a directory logo has no maturity signals or inferred product use.

## Maturity interpretation

Vercel's public stories do not publish formal Turas maturity assessments. Every formal stage therefore remains **unknown**. Capability signals describe only what the cited source supports. Their categories—operational trust, platform reuse, delivery collaboration, measurement and learning, and product adoption—are editorial groupings, not official Vercel ratings. They cannot establish internal account health, delivery ownership, fees, utilization, milestones, staffing or decisions.

Notion illustrates the distinction: the 2024 story describes marketing-site experimentation, while the March 2026 story describes Workers using Sandbox. The embedded Workers announcement says pre-alpha. Neither establishes a current FDE handoff, a company-wide maturity stage, or the fictional training and effort figures previously attached to its name.

Conflicting published metrics are flagged for Factory, The Weather Company, Helly Hansen, PAIGE and Ledger. Stripe's microsite evidence is separated from payment-platform uptime; Frame.io's expected adoption is not counted as observed adoption. The unnamed retailer is not assigned a guessed identity. Makeswift's Turborepo use is not proof of paid hosting. Historical Read.cv and Potion evidence does not establish current operating status.

## Refresh procedure

1. Revisit the directory and all archive pages, following pagination to its end. Record additions, removals and inaccessible URLs; do not silently drop a source because a slug changed case (the Avalara link required a lowercase URL during this review).
2. Read the article body, not only its title or search snippet. Identify the subject organization and exact workload. Check for partner/customer distinctions and contradictory numbers.
3. Update brief paraphrases, dates, links, scopes and cautions. Preserve canonical account IDs; merge identities only with explicit evidence. Do not infer aliases from a shared word or parent-company relationship.
4. Keep formal maturity and internal engagement fields unknown unless a separately governed operational source is introduced. Do not overwrite fictional financial scenarios with public company names.
5. Bump the version and review date, reconcile inventory counts, run the evidence unit tests, typecheck, relevant live evaluations and Playwright checks, then validate a Turas Preview.

The delivery lead owns review before a customer briefing. At production scale, move review history, source change detection and access-scoped CRM records into a governed ingestion process. A reviewed public snapshot is useful discovery context; it is not an operational system of record.
