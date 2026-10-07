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

## Preview and Analytics reconnection (2026-10-02)

The maintainer reconnected `mcteer/turas` to the existing `turas` project in the
`turas-6e414af3` team. Read-only project inspection confirmed Git deployments
are enabled, `main` is Production, non-Production deployments have Vercel
protection, and Web Analytics was already enabled with historical data.
The isolated Preview/Analytics branch adds the Analytics component and URL
redaction; historical Analytics data does not validate this new integration.

`vercel.json` installs both pinned dependency sets and runs the Next.js build.
`withEve` in `next.config.ts` supplies the Eve service integration. The runtime
uses the exact generated `VERCEL_URL` origin only in Preview; Production keeps
its explicit `TURAS_APP_ORIGIN`. Preview configuration must use the fresh marked
schema-034 database, not the legacy Preview database. Runtime configuration
uses the runtime database credential for both required URL fields; owner
credentials stay outside deployed functions and migrations remain explicit.
Private filesystem attachments, workforce imports and background processing
still require a hosted storage/worker release before those paths are usable.

Preview runtime variables were updated on 2026-10-02 after the schema-034
inspection. Both required database URL fields use the scoped runtime login.
Temporary login credentials, maintenance protection and research/model keys
were configured only for Preview. Production variables were not changed.
Local Node-24 validation passed: typecheck, eight focused configuration/privacy
tests, documentation and diff checks, and the Next.js production build.
The first Git-triggered Preview build reached READY; hosted runtime verification
uses the following deployment so it receives the refreshed Preview variables.

## Authorized Production recovery (2026-10-05)

The maintainer authorized repurposing the configured Production database after
the fresh deployment failed runtime configuration validation. The historical
Production descriptions above describe the earlier state, not the current schema.

A private custom-format backup was captured over certificate-verified TLS and
restored successfully into isolated Postgres 18 with pgvector. All 16 legacy
tables were moved into `legacy_archive_20261005`, not deleted or imported into
fresh domain records. Committed `main` at `080ad48` initialized explicit schema
041 after provisioning the required runtime role. Runtime grants and synthetic
bootstrap completed. The Production marker is `production-neon-20261005`.

Both deployed database URL variables now use a separate Production runtime login;
the migration-owner credential remains private and is not deployed. Runtime
verification confirmed three synthetic principals, no archive-schema access and
no environment-marker update privilege. Existing Production `mcteer` and `panel`
credentials were left unchanged. Partner and maintenance credentials were created
for Production only; no Preview credentials or data were copied.

Committed-main recovery deployment `dpl_4JR32V421UoWgS8rWQnuahSDJwKe`
reached READY and was aliased to `www.turas.dev` and `turas.dev`. Public HTTP
checks passed: anonymous root redirects to `/login`, login returns 200 and an
anonymous session returns the expected 401. The synthetic partner login returns
200 with Secure/HttpOnly session cookies; authenticated session, chat and customer
pages return 200. Authenticated root correctly redirects to `/s`. Logout returns
200 and reuse of the revoked cookie returns 401. A command-line Playwright/WebKit
journey independently passed browser login, chat navigation, session/customer
checks and logout. These checks establish basic site recovery, not
hosted attachment storage, background-worker, reporting-delivery or
full agent workflow acceptance. The unfinished 010 branch is not part of the
recovery deployment. Keep the private backup and archived tables until a separate
retention decision; restoring legacy service would require restoring its compatible
code/configuration as well as its database layout.
