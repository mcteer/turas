# Tasks: Read-only MCP Service

**Input**: [spec](spec.md), [plan](plan.md), [research](research.md),
[data model](data-model.md), [MCP contract](contracts/mcp-api.md),
[management](contracts/management-api.md), [validation guide](quickstart.md).

**Tests**: Required by FR-018/SC-001–006 and constitution. Task markers track validated completion.
`[P]` denotes independent files after prerequisites, not automatic delegation.
Implementation stops at release preparation until merge/release is authorized.
No paid model evaluation is required by this read-only transport slice.

## Phase 1 — Setup

- [X] T001 Confirm current main, migration 055 availability, installed Next/eve guides and exact modern SDK public definitions in `specs/015-read-only-mcp/handoff.md`; preserve model, canonical checkout, selected environment and workflow state. Pin official server/client 2.3.1 and Apache-2.0 review in `package.json`/`package-lock.json`; no speculative integration or legacy fallback. (FR-001, FR-018)
- [X] T002 Define strict versioned schemas for twelve tools, five category outputs, management, errors and operational states in `lib/contracts/mcp.ts`, enumerating existing typed domain payload variants. C01: “IDs are UUIDs; digests are 64 lowercase hexadecimal characters; generation integers are 1–9007199254740991; timestamps are UTC.” C04: “Request at most 16 KiB, response at most 128 KiB, list limit 1–20, cursor/citation handle at most 256 characters.” Reject unknown fields and silent truncation. (FR-001, FR-005–011)
- [X] T003 [P] Create owned synthetic fixtures and complete manifest in `tests/fixtures/mcp/{setup,consumer}.ts` and `scripts/mcp-suites.json`; include all tools/read classes/denials, modern pinned negotiation, no provider key and resource ownership/cleanup. (FR-018, SC-001, SC-005)

## Phase 2 — Foundation

- [X] T004 Add immutable environment/workspace/principal/member-bound connections, customer ceiling, hashed handles, durable quotas/leases and minimized receipts in `migrations/055-mcp-read-access.cjs`; bind all foreign keys/scopes to exact identities, with no customer truth changes. (FR-002, FR-004, FR-017)
- [X] T005 Update `migrations/manifest.json`, `scripts/db-role-setup.sql` and feature readiness `lib/server/mcp/schema.ts` for explicit 055/grants. C10: “Schema readiness requires exact environment and minimum 055 plus required tables/grants; no DDL on requests. Operator default is disabled.” Preserve earlier feature readiness. (FR-017, SC-006)
- [X] T006 Add explicit current read-authority union in `lib/server/auth/read-actor.ts` and shared actor guards in `lib/server/profiles/policy.ts`; use real browser-session checks or locked MCP connection with the same active principal/member/workspace/org/customer checks. C09: “Authorization is checked at admission and final projection in one transaction, with shared actor/member/customer/source locks and established revocation ordering. No cached private prose; already delivered bytes cannot be recalled. MCP read authority never becomes browser/native write authority.” (FR-002, FR-004, FR-014)
- [X] T007 Add browser/native authority regression and MCP-to-write denial tests in `tests/integration/mcp/authority.test.ts`; preserve existing `CurrentSession` write/native boundaries and independently valid MCP lifetime after browser logout. (FR-004, FR-013, SC-002)
- [X] T008 Implement category/customer-ceiling policy and transaction-scoped projection/final serialization in `lib/server/mcp/{policy,projections}.ts`; prepare shared read adapter signatures in profile/retrieval/knowledge/plan/report policies for explicit read authority without fabricating login sessions or duplicating authorization. (FR-004, FR-010, FR-014)

- [X] T009 [P] Add durable quota/denial rollback/concurrency/lease expiry/abort/unknown admission tests in `tests/integration/mcp/limits.test.ts` and cursor/revision/response bounds in `tests/contracts/mcp/bounds.test.ts`. (FR-011–012, SC-004)
- [X] T010 Implement independent quota admission and idempotent leases in `lib/server/mcp/limits.ts`. C06: “All authenticated protocol requests count toward fixed UTC-minute limits: 30 per connection, 60 per membership, 240 per workspace; at most 2 concurrent reads per connection, 4 per membership, 16 per workspace. HTTP 429 supplies integer Retry-After 1–60; concurrency release/lease expiry is idempotent. Request deadline 10 seconds, statement timeout 5 seconds, lock timeout 2 seconds; no automatic retries.” Enforce shared guard timeout compatibility; read rollback cannot erase charges. (FR-012, FR-017)
- [X] T011 Add owned local PostgreSQL/app/consumer fixture lifecycle in `scripts/mcp-environment.ts`; preserve selected root environment/workflow, private captures and exact ownership cleanup; add empty/054 restore/055 upgrade/restart/interrupted-cleanup runner in `scripts/mcp-recovery.ts`. (FR-017–018, SC-006)

## Phase 3 — US1: Connect and control access (P1)

**Independent test**: Real consumer establishes scoped internal/partner identity;
self/admin revoke, peer denial, expiry and inactive identity fail safely. Browser
logout does not silently revoke an independently authorized credential.

- [X] T012 [P] [US1] Add connection ownership, concurrency, exact replay/lost-secret response, foreign environment and expiry tests in `tests/integration/mcp/credentials.test.ts` and strict management tests in `tests/contracts/mcp/management.test.ts`. (FR-002–003, FR-015)
- [X] T013 [US1] Implement secret creation/hash verification/expiry in `lib/server/mcp/credentials.ts`. C02: “Credential secret is 32 random bytes encoded base64url, with a non-secret UUID lookup ID; SHA-256 storage, constant-time verification, Authorization header only. Name is 1–80 characters; lifetime is 1–30 days, default 7; at most 10 active connections per membership. No plaintext replay/storage.” (FR-002, FR-015)
- [X] T014 [US1] Implement explicit scope review and immutable ceilings in `lib/server/mcp/management.ts`. C03: “Categories are `profiles`, `evidence`, `knowledge`, `plans`, `reports`; 1–5 distinct categories. Customer scopes are at most 100 distinct currently authorized UUIDs; customer categories require at least one. Knowledge-only may have no customers. No wildcard, grant creation or client-supplied role.” (FR-003–004)
- [X] T015 [US1] Implement self-management, canonical `access/admin-guard.ts` workspace revocation, management quotas and receipts in `lib/server/mcp/management.ts`. C07: “Management create/revoke keys are UUIDs; exact replay returns safe receipt/metadata only, never a lost secret. Changed replay is conflict. Concurrent creation cannot exceed active cap. Scope edits/rotation require revoke and new connection; never widen a live credential.” Enforce 10 writes/member/minute and 60/workspace/minute. (FR-003, FR-015–016)
- [X] T016 [US1] Add session/CSRF-protected routes under `app/api/mcp/connections/` for list/create/revoke/admin/usage, with strict management contract, safe reconciliation, no-store and no MCP bearer management authentication; revocation remains usable while exposure is disabled. (FR-003, FR-015–016)
- [X] T017 [P] [US1] Add real SDK transport/metadata/Host/Origin/authentication/malformed/unsupported-method tests in `tests/contracts/mcp/transport.test.ts` and `tests/integration/mcp/consumer-identity.test.ts`; pin 2026-07-28 client negotiation. (FR-001–002, SC-001)
- [X] T018 [US1] Implement authenticated fetch-native transport in `lib/server/mcp/transport.ts` and `app/api/mcp/v1/route.ts`; fixed `server/discover`, `tools/list`, `tools/call`, body/header protocol/method/name validation, canonical Host/Origin, HTTP/error contract, no-store, size/deadline/abort guards; no sessions/OAuth discovery/legacy fallback. (FR-001, FR-012–013, FR-015)
- [X] T019 [US1] Implement twelve-name allowlist and scoped discovery/identity/customer reference tools in `lib/server/mcp/tools.ts`; strict frozen schemas/annotations and current customer visibility, no generic eve/model dispatcher. Unbuilt content adapters must remain unavailable, never partial accepted context. (FR-001, FR-004, FR-010, FR-013)
- [X] T020 [US1] Add accessible Connections management in `app/(workspace)/settings/connections/page.tsx`, `app/_components/mcp/connections.tsx` and role-aware shell link in `app/_components/app-shell.tsx`; explicit scope selection, one-time ephemeral secret, revoke confirmation, safe usage and uncertain response reconciliation per management contract. (FR-003, FR-015–016, SC-003)
- [X] T021 [US1] Add actual management/peer/admin/expiry/secret-storage/uncertain-response CLI WebKit tests in `tests/ui/mcp-connections.spec.ts`; ensure credentials never enter captures and check two-minute create/revoke outcome. (FR-015–016, SC-003)

## Phase 4 — US2: Current profiles, evidence and knowledge (P1)

**Independent test**: Internal and assigned-partner projections match current shared
policy; pending/withdrawn/conflicted originals and foreign citations are withheld
with workers stopped; shared publications reveal no originating customer lineage.

- [X] T022 [P] [US2] Add accepted profile/partner field/maturity separation/page bounds/conflict tests in `tests/integration/mcp/profiles.test.ts`; include profile data larger than one page and no hidden totals/private rationale. (FR-005, FR-010–011, SC-001)
- [X] T023 [US2] Add narrow transaction-aware accepted summary/workload/fact pagination in `lib/server/profiles/read.ts` and `lib/server/mcp/profiles.ts`; reuse projection/eligibility policy, remove UI capabilities, exclude unsupported/conflicted prose as settled facts and preserve original dates/unknowns. (FR-004–005, FR-014)
- [X] T024 [P] [US2] Add pending/withdrawn/superseded/stale/conflict/rights-loss source and same-member cross-credential citation tests in `tests/integration/mcp/evidence.test.ts`, including historical internal inspection denial and zero embeddings/model dispatch. (FR-006, FR-013–014, SC-002)
- [X] T025 [US2] Implement eligible source summaries/exact passages and metadata-only citation bindings in `lib/server/retrieval/{policy,projections,citations}.ts` and `lib/server/mcp/evidence.ts`; reuse source fences, not unrestricted historical reads or `searchEvidence`; no embedding/search/research generation. (FR-004, FR-006, FR-013–014)
- [X] T026 [US2] Implement opaque persisted cursor/citation resolution in `lib/server/mcp/handles.ts`. C05: “Continuation/citation handles use 32 random bytes and hashed lookup, expire within 15 minutes, bind environment/workspace/principal/membership/connection/category/customer/section and scope digest. Positions are immutable metadata only; no source prose. Same-member different-connection swapping is denied.” Bind current revision/digest; changed/expired/foreign handles fail safely. (FR-006, FR-011, FR-014)
- [X] T027 [P] [US2] Add sanitized shared-practice/hidden lineage/withdrawal/scan exhaustion tests in `tests/integration/mcp/knowledge.test.ts`; knowledge-only connection succeeds without customer grants. (FR-007, FR-010–011, SC-001–002)
- [X] T028 [US2] Implement bounded current shared publication adapter in `lib/server/knowledge/read.ts` and `lib/server/mcp/knowledge.ts`, applying lineage/conflict eligibility and explicit incomplete/unavailable on exhausted scan; no originating identities/counts or private contribution lineage. (FR-007, FR-010–011, FR-014)
- [X] T029 [US2] Bind profile/evidence/knowledge tools in `lib/server/mcp/tools.ts` and verify real SDK parity, source change during serialization and no cached result prose in `tests/integration/mcp/consumer-context.test.ts`; preserve strict output/byte bounds and metadata-only handle writes. (FR-005–007, FR-014, SC-001–002)

## Phase 5 — US3: Accepted plans and published reports (P2)

**Independent test**: Real consumer reads accepted baselines and authorized current
publications; newer drafts, wrong audience, changed dependencies and forbidden
mutation/generation/export/send names produce no unauthorized content/actions.

- [X] T030 [P] [US3] Add accepted-versus-draft plan/design, audience, lost grants/lineage, baseline changes and oversized result tests in `tests/integration/mcp/plans.test.ts`. (FR-008, FR-010, FR-014)
- [X] T031 [US3] Implement explicit current accepted plan/design projection in `lib/server/plans/{read,policy,sources}.ts` and `lib/server/mcp/plans.ts`; existing browser draft behavior remains unchanged, MCP omits edit/review/private-lineage fields and preserves baseline/assumptions/current source fence. (FR-008, FR-014)
- [X] T032 [P] [US3] Add published-versus-draft report/audience/correction/withdrawal/large body and no file/export tests in `tests/integration/mcp/reports.test.ts`. (FR-009–010, FR-013–014)
- [X] T033 [US3] Implement transaction-aware current publication selection/final fence in `lib/server/reports/{read,release}.ts` and `lib/server/mcp/reports.ts`; preserve partner delivery-only projection, exclude drafts/artifacts/download metadata and never call rendering/export/delivery. (FR-009, FR-013–014)
- [X] T034 [US3] Bind plan/report tools and verify consumer parity plus every unknown/mutation/approval/generation/export/send denial in `lib/server/mcp/tools.ts` and `tests/integration/mcp/consumer-delivery.test.ts`; assert zero customer/domain writes, embeddings/models, files or sends. (FR-008–010, FR-013, SC-001, SC-005)

## Phase 6 — US4: Limits, safe usage and recovery (P2)

**Independent test**: Full consumer handles malformed/foreign/expired continuation,
quota/concurrency/timeouts and unavailable responses; owned upgrade/restart preserves
all original data and revoked authority; logs/storage never expose private payloads.

- [X] T035 [US4] Implement safe audit/usage and owner/admin projections in `lib/server/mcp/audit.ts`, including telemetry/storage redaction tests in `tests/integration/mcp/audit.test.ts`; no raw credentials, arguments, customer prose/names, source locations or hidden counts. (FR-015–016)
- [X] T036 [US4] Implement idempotent operational cleanup in `lib/server/mcp/retention.ts` and wire existing `scripts/maintenance-worker.ts`. C08: “Usage metadata retains at most 90 days; expired handles/leases are deleted in batches of at most 100. Revoked/expired credential hashes are purged within 24 hours after revocation/expiry, leaving minimal revocation identity and create/revoke tombstones for environment lifetime. No source content, credentials, arguments, source locations or customer names in audit/logs.” Cleanup never grants/revives authority. (FR-014, FR-017)
- [X] T037 [US4] Add disabled/schema/grant/lifecycle/race/cleanup-outage recovery tests in `tests/integration/mcp/recovery.test.ts`; confirm revoke/reconciliation remain available disabled, final source/authority fences survive stopped workers and existing records remain unchanged. (FR-014, FR-017–018, SC-002, SC-006)
- [X] T038 [US4] Extend `scripts/learning-activate.ts` to verified schema 054/055 only, retaining owner/environment and transactional gates; add compatibility checks in `tests/integration/mcp/learning-compatibility.test.ts` for both versions and denial of unknown schemas. (FR-017–018, SC-006)
- [X] T039 [US4] Add complete deterministic/real SDK consumer/build runners and package scripts in `scripts/{test-mcp,check-mcp-consumer,check-mcp-build}.ts` and `package.json`; reject incomplete/filtered/skipped/flaky/source-changing acceptance, use production runtime and no provider credentials. (FR-018, SC-001, SC-005)
- [X] T040 [US4] Add accessible empty/error/expiry/scope-loss/role navigation/keyboard/focus/theme/overflow tests in `tests/ui/mcp-accessibility.spec.ts` and full four-project owned runner in `scripts/check-mcp-ui.ts`; serious/critical axe zero, inspect safe synthetic screenshots, no host browser. (FR-016, FR-018, SC-003, SC-005)
- [X] T041 [US4] Implement five-class ×100 quota-paced governed-read benchmark in `scripts/benchmark-mcp.ts`; p95 <1000ms, quota waits/network overhead reported separately, over-limit trials prove bounds without bypassing production quotas. (FR-012, FR-018, SC-004)

## Phase 7 — Cross-cutting verification and release

- [X] T042 Run current shared actor/profile/evidence/retrieval/knowledge/plan/report/browser/native regressions via `scripts/test-mcp-regressions.ts`; capture exact suite counts/source hashes in `specs/015-read-only-mcp/validation.md`, including existing 014 withdrawal browser timeout history without pretending diagnostics prove a root cause. (FR-004, FR-014, FR-018, SC-005)
- [X] T043 Add mandatory deterministic/consumer/WebKit/recovery/benchmark/regression gates to `.github/workflows/ci.yml` and exact source-bound evidence in `scripts/mcp-ci-evidence.ts`; never accept filtered manifests or stale-source local proof. (FR-018, SC-005)
- [X] T044 Update `.env.example`, `docs/mcp-operations.md`, `README.md`, `ROADMAP.md` and `specs/015-read-only-mcp/{quickstart,handoff,validation}.md` with manual-header compatibility limits, disablement, one-time secret loss, revocation/retention/recovery, explicit 055/grants and exact read-only domain boundaries. (FR-001–003, FR-015–018)
- [X] T045 Run complete authorized local gates/build/docs/diff review, update only evidence-backed task/status records in `specs/015-read-only-mcp/{tasks,validation,handoff}.md`, and prepare reviewable PR; no paid provider calls or hosted changes under planning authorization. (FR-018, SC-001–006)
- [X] T046 After explicit merge/release authorization and all completed CI checks green, perform selected-target backup/restore rehearsal, explicit 055/grants, compatible disabled deployment, activation and available Production HTTP/SDK/CLI WebKit checks per `docs/mcp-operations.md`; revoke disposable test credentials, record deployed identity/schema/role/read coverage/limits in `specs/015-read-only-mcp/validation.md`, delete merged branches and verify README on main. Never fabricate grants/customer records or claim absent-record coverage. (FR-017–018, SC-006)

- [X] T047 Correct the hosted modern SDK tool-error envelope without disclosing private errors; verify out-of-scope customer and invalid-input denials through the actual pinned consumer. Full local consumer manifest passes 19 suites/54 cases. Production acceptance still requires the corrected committed release and T046. (FR-004, FR-018)

- [X] T048 Preserve research locator equality across PostgreSQL JSONB object ordering; add an actual SDK synthetic current research passage/citation case and changed-URL withholding. Complete fresh consumer/type/doc/CI gates, then repeat Production passage/citation checks under T046. (FR-006, FR-011, FR-018)

## Dependencies and parallel opportunities

Setup T001–003 → foundation T004–011 → US1 T012–021 → US2 T022–029 → US3
T030–034 → US4 T035–041 → final T042–046. Shared authority, quota admission and
the owned environment are complete before independent story checks. No unlimited
partial service may ship. US2/US3 adapter tests may be authored in parallel after
shared authority/schema/contracts exist; common policy/tool files stay sequential.

Examples: US1 management/transport tests T012/T017; US2 profile/evidence/knowledge
fixtures T022/T024/T027; US3 plan/report tests T030/T032; US4 safe audit/UI tests
T035/T040 after their respective contracts/adapters. These are file independence
opportunities, not instructions to spawn additional agents.

## Implementation strategy

First checkpoint is US1 identity and revocable metadata with no unbuilt content
exposure, followed by profiles/evidence/knowledge, then accepted delivery reads.
Complete quotas/fences and all mandatory gates before exposing any checkpoint.
All four stories are required for 015 acceptance; a scoped MVP does not mark the
whole feature complete. Release T046 is distinct from local/CI acceptance.

## Requirement coverage

| Requirements / outcomes | Tasks |
| --- | --- |
| FR-001 | T001–003, T017–019, T039, T044 |
| FR-002–003 | T004, T006, T012–016, T020–021 |
| FR-004 | T006–008, T014, T019, T023–029, T042 |
| FR-005–007 | T022–029 |
| FR-008–009 | T030–034 |
| FR-010 | T002, T008, T019, T022–034 |
| FR-011 | T002, T022–028, T009 |
| FR-012 | T018, T009–010, T041 |
| FR-013 | T007, T018–019, T024–025, T033–034 |
| FR-014 | T006–008, T023–034, T036–037, T042 |
| FR-015–016 | T012–021, T035, T040, T044 |
| FR-017 | T004–005, T010, T011, T036–038, T044, T046 |
| FR-018 | T001–003, T011, T037–046 |
| SC-001 | T003, T017, T022–034, T039, T045 |
| SC-002 | T007, T024–029, T037, T045 |
| SC-003 | T020–021, T040, T045 |
| SC-004 | T009–010, T041, T045 |
| SC-005 | T003, T034, T039–043, T045 |
| SC-006 | T005, T011, T037–038, T045–046 |
