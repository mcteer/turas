# Environment handoff for a later hosted release

The legacy Production site is live on its Neon Production database. Leave that
database and its credential untouched during feature 005. The ignored
`.env.local` contains distinct `NEON_PREVIEW_DB` and `NEON_PROD_DB` connection
strings. The recreated Preview endpoint was inspected read only on 2026-09-29.
Its original database held 16 legacy Turas tables with no fresh-app marker or
migration ledger, so those tables were left untouched. The fresh app now uses
an empty database created in the Preview branch, `turas_preview_005`.
Explicit migrations reached schema 028 with marker `preview-neon-005` and
pgvector 0.8.6. A separate `turas_runtime` login uses the pooled app endpoint;
the direct owner endpoint is reserved for migrations and role grants.

Run `npm run db:inspect-preview` from a network-enabled terminal to print only
Postgres, vector and schema-readiness metadata. The command verifies that the
configured app and direct URLs select Preview, opens a read-only transaction,
and never prints a connection string, hostname, database name or secret. A
successful inspection permits an explicit Preview setup decision. The two
named Turas OrbStack Postgres containers were stopped and removed after the
pooled Neon runtime connection completed synthetic bootstrap. Their volumes
were retained. Production remains live and untouched.

Feature 005 remains a local implementation slice. Before using a fresh Preview
database for app traffic, inspect it read only, identify its existing schema,
confirm Postgres and pgvector support, and establish the matching
`turas_environment` marker. At the later Production
cutover, plan explicit compatible migrations and verification around the live
legacy site. Never point development or disposable tests at Production, and do
not copy Preview data or credentials into Production as a schema update.

| Former Vercel variable | Current purpose and handoff |
| --- | --- |
| `DATABASE_URL` (Production and Preview) | Runtime pooled connection. Local development now selects the Preview endpoint. The legacy Production site continues to use its Production connection; hosted cutover is a separate release. |
| `CONTEXT_API_KEY` (Production and Preview) | Server-only Context.dev public search key for 005 live research. Set per scope when research is enabled. |
| `TURAS_DEMO_USERNAME`, `TURAS_DEMO_PASSWORD`, `PANEL_USERNAME`, `PANEL_PASSWORD` | Temporary login configuration still used by the fresh app. Supply only if these demo accounts are intentionally enabled for that environment. |
| `CRON_SECRET` | Legacy Vercel cron authentication; no current reader. Do not carry forward without a hosted worker design. |
| `TURAS_SESSION_SECRET` | Legacy signed-session secret; fresh sessions are held in Postgres and do not read it. |
| `EVE_MEMORY_BLOB_WEBHOOK_PUBLIC_KEY`, `EVE_MEMORY_BLOB_STORE_ID` | Legacy file-memory integration; the fresh agent does not use this backend. Do not carry forward absent an implemented use. |

The fresh app also needs names that were not in the screenshot:

| Variable | Scope and purpose |
| --- | --- |
| `DATABASE_URL_UNPOOLED` | Direct connection to the **same** environment's selected database for explicit migrations and role setup. |
| `TURAS_ENVIRONMENT_ID` | Unique marker matching the selected database's `turas_environment` row; never share a marker across Preview and Production. |
| `TURAS_APP_ORIGIN` | Exact origin for that deployment scope. |
| `PARTNER_USERNAME`, `PARTNER_PASSWORD` | Temporary partner login, with explicit customer grants. |
| `TURAS_MAINTENANCE_SECRET` | New per-environment secret for maintenance and request protections; do not reuse a legacy session or cron secret by default. |
| `AI_GATEWAY_API_KEY` | Currently required by the 005 embedding call path. Confirm hosted gateway authentication before omitting it. |
| `TURAS_005_DISABLED` | Set to `1` and restart the app/worker to close 005 intake and retrieval dispatch during rollback; clear only after forward recovery checks. |
| `TURAS_ARTIFACT_STORE_ROOT` | Private local filesystem path for 004 artifacts. A hosted durable-store design is required before deploying attachment paths; a Vercel filesystem path alone is insufficient. |

`TURAS_TEST_DATABASE_URL`, `TURAS_TEST_ENVIRONMENT_ID`, and
`TURAS_TEST_ARTIFACT_STORE_ROOT` are for disposable test resources only. Existing
005 recovery, isolated actual-output evaluation and live research workflow
smokes use separate temporary Neon databases or clones and remove them after
the check. A synthetic database/store and bound native session passed a local
restart drill; a hosted restore of real customer data remains untested.
A separate `turas_test_005_neon` database
in the Preview branch has schema 028 and marker `test-neon-005`. The test guard
permits that direct endpoint only when it differs from the selected app and
Production databases. Never aim disposable tests at the selected Preview app
or Production database. No secret values belong in this document or a commit.
