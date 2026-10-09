# Lifecycle, Operations and Validation Contract

## Feature operations

`TURAS_013_DISABLED=1` follows C16. Reads still enforce eligibility; disabled does not restore access or skip migrations. Metadata-only retirement/withdrawal, status/resolve and maintenance continue. Missing migration 050/051 yields safe unavailable responses; the worker skips only the absent 013 schema and does not block earlier domains. The flag defaults to 0 after explicitly applying migrations; it is not authority or a hosted rollout claim.

The existing `scripts/maintenance-worker.ts` invokes bounded 013 maintenance independently of 009/report delivery enablement and the new-work flag. Reuse the same database/environment and workflow directory. Record invalidation immediately where source changes provide hooks, and bounded scans catch original expiry/changes; reads and reviews always recheck originals with workers stopped. Original source withdrawal/expiry time establishes purge due time, never time discovered by retry. Due jobs retain earliest deadlines, use SKIP LOCKED and bounded retry, expose overdue health and never mark failed deletion complete. Startup resumes due work; shutdown stops scheduling and drains in-flight ticks before closing pools. No destructive schema rollback; disable new work, recover the same environment and apply reviewed forward migrations.

Telemetry: allowlisted action, outcome, safe reason, contract version and bounded latency bucket; correlation/request identity only in restricted operational event fields, never metric labels. No names, source IDs/URLs, prose, notes, raw SQL/driver errors, credentials or input digests. Maintenance emits queue depth, oldest overdue age, failures and purge counts with bounded labels. Request-time limits are C14; body limit 160 KiB; all pages C08; no implicit fan-out across all customers.

## Owned validation environment

Create fixtures only through `scripts/partners-environment.ts` and `tests/fixtures/partners/environment.ts`. The runner must prove an owned synthetic environment/database/container before seeding, migrating, resetting rates or cleanup. Never inherit the selected Preview/Production database as a test target. Keep private output under ignored `local-artifacts/013/`, not sibling repositories. Use a unique run marker, ephemeral ports, explicit child environment and supervised processes; preserve `.env.local`, `.eve/.workflow-data` and unrelated state. Clean up only owned resources on success/failure/signals after draining async work.

The harness emits a machine-readable final source revision, schema versions, manifest digests, executed tests/cases, skips, failures, missing cases, timings and exit status. A modified tracked source after evidence capture invalidates that acceptance set. Evidence documents can be committed afterward while retaining the exact tested source identity; rerun affected suites after source changes and then produce one complete final set. No empty suite, skipped declared case or shortened browser list can pass.

## Canonical suites

`scripts/partners-suites.json` contains exactly these initial feature suite paths; extending the feature adds to the manifest. A manifest coverage test discovers matching files and rejects omission, duplicates, missing paths or zero executed tests.

- `tests/unit/partner-content.test.ts`: C01–C09 schema, source mapping, bounds and prerequisite cycles.
- `tests/unit/partner-progress.test.ts`: C10–C12 fractions, optional/prerequisite/withdrawn/obsolete states.
- `tests/unit/partner-runner-coverage.test.ts`: exact manifests, subprocess exit/skip enforcement and owned cleanup guards.
- `tests/contracts/partner-http.test.ts`: all endpoints/action unions, limits, cache/CSRF, status/resolve and disabled behavior.
- `tests/contracts/partner-projection.test.ts`: partner field allowlists, shared citations, safe errors/history, no cross-member sentinel.
- `tests/integration/partner-foundation.test.ts`: migrations, actor/target locks, organization and membership epochs, idempotency/quotas/deadlines.
- `tests/integration/partner-workspace.test.ts`: >50 customers/engagements, search/cursor changes, internal vs partner and no grants.
- `tests/integration/partner-guides.test.ts`: every guide state, self-review, exact previews, rejected draft vs published head and source quality.
- `tests/integration/partner-source-races.test.ts`: source/publication/baseline/target revocation before commit, original expiry with workers stopped, private lineage and pending claims.
- `tests/integration/partner-learning.test.ts`: assignment/replacement, private attempts, review/prerequisite races, accepted-evidence gate and unchanged other-domain states.
- `tests/integration/partner-retention-recovery.test.ts`: C15/C16 deadlines, retry interruption, withheld history, receipt minimization/tombstones, lost acknowledgments/resolve vs late admission and disabled maintenance.

## Complete browser journeys

`scripts/partners-ui-journeys.json` lists all five files below. Run each in `webkit-desktop-light`, `webkit-desktop-dark` (1440×900), `webkit-mobile-light`, `webkit-mobile-dark` (390×844), using command-line Playwright and WebKit, never the host browser. Record actual case counts; five files × four projects is the file/project matrix, not a fabricated assertion count.

| Journey file | Required path and assertions |
| --- | --- |
| `tests/ui/partner-workspace.spec.ts` | Granted A only, >50 pagination, own plan proposal and execution contribution remain proposed, accepted support read-only, shared publication derived from B sanitized, zero-grant knowledge usable |
| `tests/ui/partner-guides.spec.ts` | Internal draft → submit → mcteer exact preview/publish including self-review → partner lesson/citations; rejected/new draft retains old head; retire/source invalidation withholds |
| `tests/ui/partner-learning.spec.ts` | Assign two members → one drafts/submits → request changes → corrected evidenced submission → verify; accurate required fraction, prerequisites, second partner prose isolation; explicit replacement begins at zero |
| `tests/ui/partner-revocation.spec.ts` | Focus/visibility/back and ≤15-second polling, slow out-of-order response, grant/member/org/source change, failed revalidation, lost acknowledgment/reload/resolve, disabled controls and no customer prose in storage |
| `tests/ui/partner-accessibility.spec.ts` | Long title/body, keyboard form/review/dialog path, focus restoration, no page overflow and zero serious/critical axe violations on workspace, guide, assignment and reviewer states |

Use synthetic screenshots for visual inspection under the ignored owned artifact directory, without enabling unrestricted trace/network capture or customer screenshots.

## Representative load

Seed 120 customer references, two partner organizations, ten individually granted partner members with different grants, and a selected customer with 120 accepted delivery engagements/guides. Include a maximum-size guide (20 lessons, 40 checkpoints), maximum 200-original dependency closure, 100 active learning assignments for a member/customer, and another member/customer available for writes. Do not exceed C10 to manufacture load. Seed eligible accepted evidence and both hidden and visible sentinels. Discovery must traverse beyond the first page correctly.

Measure 100 completed operations in EACH class: workspace customer page, scoped engagement/guide list page (50 of each), guide detail, assignment detail, review (50 publications plus 50 verifications), assignment create/replace, checkpoint save/submit (50 of each). Reads use five concurrent authorized readers; writes use appropriate authorized actors with quota-aware admission pacing. Time actual request/domain completion, including lock/source work; record pacing separately and preserve real production rate limits, with no rate reset during a measured class. Preview prerequisites consume normal mutation quota. A 429, timeout, hidden sentinel, incomplete scope or noneligible result is a failure, not discarded latency. Report per-class p50/p95/max/error count; each p95 ≤2 seconds. The runner may take many minutes to respect mcteer's quota; no live model cost is involved.

## Migration, recovery and regressions

Recovery runner: (1) empty owned database → all migrations; (2) owned schema-049 predecessor with synthetic existing customer, grants, plan, execution, shared-knowledge, conversation and workflow markers → 050/051; (3) restart same database/workflow pair; (4) interrupt commands before/after commit, expire previews and stop cleanup; (5) withdraw original, restart cleanup under disabled flag, verify original purge deadlines, tombstones and no restored body. Assert unchanged earlier-domain identities/counts/digests and exact migration manifest. Do not claim hosted recovery.

`scripts/partners-regression-suites.json` must enumerate these existing files without skipping cases:

- `tests/integration/grant-concurrency.test.ts`
- `tests/integration/profile-partner-access.test.ts`
- `tests/integration/retrieval-fences.test.ts`
- `tests/integration/knowledge-publication.test.ts`
- `tests/integration/plan-authoring.test.ts`
- `tests/integration/plan-acceptance.test.ts`
- `tests/contracts/execution-policy.test.ts`
- `tests/contracts/execution-time-api.test.ts`
- `tests/integration/support-policy.test.ts`
- `tests/contracts/conversations.test.ts`
- `tests/integration/conversation-delivery.test.ts`
- `tests/ui/profile-partner.spec.ts`
- `tests/ui/conversation-archive.spec.ts`

Fail if any path is absent. Run the canonical plan/execution/support feature runners when their required fixture environments cannot be safely shared, recording these exact files within their results. Never replace their setup with partial ad-hoc fixtures. Include existing partner UI paths in the regression gate where reused links change. No new Turi evaluation is required unless implementation changes agent behavior; such scope change must first update this design.

Acceptance also requires `npm run typecheck`, docs checks and existing build verification, plus CI's complete feature matrix for the final source. Local behavior, CI evidence, and Preview/Production deployment remain separately labeled. Hosted migration, production data, sends and deployment are not authorized by this plan.
