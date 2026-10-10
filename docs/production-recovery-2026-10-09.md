# Production schema recovery — 2026-10-09

Product Gaps failed with a server error because Production code at
`7a3e8947408d396b5ab0867e6ec92648d1ea775b` required migrations newer than its
schema 045. The Product Gaps API returned 503 `schema_unavailable`; Partner
Delivery also returned 500. The deployment itself was ready.

At 21:20 UTC, migrations 046–051 and the checked-in runtime role grants were
applied using the explicit operator after verifying the Production environment
marker. A private, certificate-verified backup was restored into an owned local
database first. The migration rehearsal preserved the original columns and rows
across 294 restored tables, including the legacy archive. Production now reports
schema 051 with 51 applied migrations. Runtime grants permit the new tables but
deny environment-marker writes and legacy-archive access.

Authenticated HTTP checks passed for `/s`, `/product-gaps`,
`/api/product-gaps` and `/partners`. Command-line WebKit checks for `mcteer` and
`panel` confirmed rendered Product Gaps and Partner Delivery, successful Product
Gaps refresh, and 200 responses from both backing APIs, with zero browser runtime
errors. Each test session was signed out. The configured local partner credentials
returned 401 in Production, so this recovery does not claim a hosted partner-role
check. It also does not certify engineering exports, external delivery or every
other hosted workflow.

The owned rehearsal container and anonymous volume were removed. The recovery
backup, private logs and content-free check results remain in ignored local
artifacts within the canonical repository; no customer data or secrets are
committed. The selected `.env.local` and eve workflow data were preserved.

The separate post-merge CI run failed during container initialization because of
Docker Hub's unauthenticated pull limit; this was not the source of the Production
schema error. Pre-merge feature CI had passed.

[Contributing](../CONTRIBUTING.md) and [development instructions](../AGENTS.md)
now require migrations/grants as part of schema-dependent releases and actual
Production verification after merge. Local checks and CI alone are insufficient.
