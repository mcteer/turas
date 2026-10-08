# Research: Product Expansion Opportunities

**Date**: 2026-10-08. Read-only repository/framework review at main `187b057`.
No runtime, provider, database or hosted check was performed for this planning slice.
The Spec Kit plan workflow requested two bounded research reviews: domain/evidence
reuse and native-advice/test integration. Findings below are design decisions,
not proof of implemented behavior. No new external integration is needed.

## R01 — Separate customer opportunity from commercial commitment

**Decision**: Customer/workload-scoped hypotheses with proposed, qualified, deferred
and dismissed dispositions; internal-only projections and current account-owner
review. Keep mutable proposed revisions separate from the last decided revision.
**Rationale**: Roadmap 011 and blueprint TR-03 require explanation, transparent rank,
account qualification, dismissal and re-evaluation; the constitution separates
maturity, delivery and commerce. Existing 006/008 links provide engagement context.
**Alternatives**: CRM opportunity/forecast objects, automatic upsell scores and
partner-facing opportunity data exceed the bounded slice.
**References**: `docs/product-blueprint.md`, `ROADMAP.md`, `specs/006-delivery-plans/`,
`specs/008-engagement-execution/`.

## R02 — Explicit account-owner authority

**Decision**: A new per-customer versioned internal owner assignment. Canonical
mcteer controls assignment; only the assigned active member controls dispositions.
No implicit administrator override or initial backfill. User confirmed this choice.
**Rationale**: `requireSteward` allows admin factual review and 010 fixes review to
mcteer; neither expresses an account owner's distinct decision right. Recheck owner
membership/assignment generation at preview, commit, generation and replay.
**Alternatives**: Reusing stewardship would silently grant excess authority; any
internal member review would contradict accountable qualification.
**References**: `lib/server/profiles/policy.ts`, `lib/server/support/policy.ts`,
`lib/server/access/service.ts`.

## R03 — Reuse original evidence, reject conflicting closure identities

**Decision**: Compose an expansion source adapter from plan/support/execution
primitives. Persist original revision/generation/digest/locator; reject inconsistent
repeated identities instead of taking the first. Use the 200-dependency expansion
adapter without raising older generic retrieval's 100-dependency limit.
**Rationale**: Support supplies customer-wide/workload selection and explicit
engagements; original-current and factual eligibility gates already preserve
approval, quality and audience. Public dossiers remain attributed. Accepted customer
need plus current product fit is necessary for qualification; research alone does
not establish private intent. Weak but verified public observations remain eligible
for explicitly attributed discovery, not as qualification-critical facts. Temporary citation TTL cannot expire durable evidence.
**Alternatives**: New evidence storage duplicates governance; blind copying support's
closure deduplication would permit conflicting generation/digest inputs.
**References**: `lib/server/support/sources.ts`, `lib/server/plans/sources.ts`,
`lib/server/execution/dependencies.ts`, `lib/server/retrieval/{context,fences}.ts`,
`docs/evidence-policy.md`.

## R04 — Product identities and honest deterministic ordering

**Decision**: Reuse profile `productKey` grammar and adoption states. A bounded,
versioned alias map identifies products without making capability claims. Use the
complete lexicographic rank in the data model and explicit opaque duplicate identity.
**Rationale**: There is no existing alias catalog or expansion scoring rule. Product
count, spend and missing mentions do not measure success or suitability. Unknowns
must remain visible and dismissed matches must survive text cleanup.
**Alternatives**: External catalog sync, model similarity deduplication and weighted
sales probability add unjustified integration, uncertainty and false precision.
**References**: `lib/contracts/profile-payloads.ts`, `lib/server/support/cursor.ts`,
`.specify/memory/constitution.md`.

## R05 — Exact revision commands and forward recovery

**Decision**: Add provisional migration 046 for core/owner/receipts/retention and 047
for advice. Use immutable identity plus purgeable payload, current-authorized replay,
opaque expired keys, indexed invalidation and read fences independent of maintenance.
**Rationale**: 042/043 provide the closest domain pattern. Owner membership discovery
must precede sorted authority locks; command admission precedes originals, selected
engagement heads and expansion heads. No network I/O occurs under locks.
**Alternatives**: Editing prior migrations, request-time schema changes, mutable
accepted text or destructive rollback violate existing contracts.
**References**: `migrations/042-support-guidance.cjs`, `migrations/043-support-advice.cjs`,
`lib/server/support/{commands,review,invalidation,maintenance}.ts`.

## R06 — Native Turi governance without a model change

**Decision**: Add explicit `expansion` feature binding and three read tools plus one
procedure skill. Extend existing compatibility dispatch instead of `agent/agent.ts`.
**Rationale**: `staffingResponseScope`, conversation model admission and
`wrapStaffingModel` already route governed workflows. Enforce strict schemas/tool
allowlist before provider invocation; output remains withheld until final validation.
Uncertain dispatch settles metadata without redispatch. Save uses an explicit human
command and exact retained output/source map.
**Alternatives**: Generic chat, prompt-only restrictions or a new autonomous subagent
would bypass scope/budget/approval boundaries. No new integration or runtime subagent.
**References**: `lib/server/conversations/{feature,model-admission,dispatch}.ts`,
`lib/server/staffing/{native-context,model-budget,context}.ts`,
`lib/server/support/{model-budget,native-events,native-reconcile,suggestions}.ts`.

## R07 — Complete native and test integration

**Decision**: Update all native release/history/replay/cancel/retirement consumers,
capability exclusion paths and DB exclusivity in both insertion directions. Use
per-user/scope active attempt uniqueness, not support's per-user-global index.
Add owned 011 runners, source digest and complete suite manifests to CI.
**Rationale**: Feature union changes alone do not deny generic tool fallback; some
existing instruction/actor branches enumerate only older features. Existing runner
ownership prevents later suites leaking into prior-feature cohorts and selected DBs.
**Alternatives**: Smoke-only acceptance and running tests on the selected checkout
would not establish complete behavior or database isolation.
**References**: `agent/hooks/guard-customer-context.ts`, `agent/tools/load_skill.ts`,
`lib/server/profiles/tool-actor.ts`, `lib/server/conversations/eve-routes.ts`,
`scripts/{test-support,check-support-ui,plan-eval-environment,execution-source-digest}.ts`,
`playwright.config.ts`, `.github/workflows/ci.yml`.

## R08 — Pinned framework conventions

**Decision**: Retain Node24, Next16.3.4, React19.2.6, TypeScript7.0.2, eve0.67.1,
AI SDK7.0.116 (lockfile), pg8.23.0, Zod4.5.4, Vitest5.0.2 and Playwright1.63.0.
No dependency upgrade is planned.
**Rationale**: Installed eve README routes typed tools to `tools/overview.mdx` and
procedures to `skills.mdx`; skills add instructions, not permission. Installed Next
route-handler docs specify Web Request/Response handlers; use asynchronous route
params and no-store projections consistent with current handlers. Re-read installed
routed pages during implementation if the lockfile changes.
**Alternatives**: Relying on remembered framework APIs or upgrading while building
011 creates unrelated compatibility risk.
**Documentation inspected**: installed eve `docs/README.md`, `tools/overview.mdx`,
`skills.mdx`; installed Next `dist/docs/01-app/03-api-reference/03-file-conventions/route.md`.
Packages were read from the existing sibling worktree's identical installed version;
no package install or generated framework file change was needed for planning.

No unresolved technical research question remains. The original `turas` checkout's
uncommitted work and the read-only legacy repository were left unchanged.
