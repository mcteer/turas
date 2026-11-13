# Research decisions

- **Decision:** Keep the seven-day search trigger separate from evidence-quality-v1.
  **Rationale:** Current claim windows range from 7 to 180 days, while source/research
  cache reuse expires after six hours. These describe different things. Rechecking
  a historical article must not give its historical event a new date.
  **Alternative:** Replacing every age window would erase useful historical quality.
- **Decision:** Filter public practice snapshots in current guidance before ranking.
  **Rationale:** Ordinary chat previously received expired passages with a warning;
  only specialist workers excluded expired snapshots. Model warnings alone do not
  enforce freshness, and filtering after the limit can hide fresh candidates.
- **Decision:** Reuse prepare_customer_research and existing specialist workflows.
  **Rationale:** They enforce scope, reservation, worker lineage, budgets, expiry,
  cancellation and persistence. Ordinary dynamic tools cannot call ctx.agent; eve
  requires a static workflow for that API. No direct unbudgeted fetch or hidden
  worker bypass. Missing canonical account remains an explicit research limitation.
- **Decision:** Default to current_fact and use explicit historical modes when asked.
  **Rationale:** Reviewed/accepted does not mean recently verified. Root instructions
  must seek fresh support without a second user request and preserve unresolved gaps.
- **Decision:** Add an EXISTS-passages filter to retired-source cleanup.
  **Rationale:** The existing first-100 selector retains already-empty source rows,
  so three exact-SQL passes over 101 sources left source101 untouched in disposable
  Postgres. Queued individual cleanup is separate; this fixes the fallback sweep.
- **Validation environment:** Node24 with withLearningEnvironment, no native/app start,
  owned synthetic Postgres and separate child processes for env-mutating suites.

- **Review correction:** Current-only public-reference freshness must survive the
  initial tool read. Existing named-content history intentionally tracks withdrawal,
  not use mode or expiry. Add separate active expiry records and retire them through
  the existing ordinary context-refresh packet; do not overload the withdrawal ledger.
- **Compatibility:** CURRENT_SCHEMA_VERSION is an exact version contract. Adding86
  requires a coordinated code/schema cutover and matched recovery, not code-only rollback.
- **Boundary/privacy:** Seven-day research action uses elapsed time, live-document
  treatment requires canonical Vercel docs URLs, shared original dates use the common
  profileSourceDates helper, and exact guidance deadlines stay out of public shared
  quality and strict MCP v1 DTOs.
