# Research: Delivery plans and technical designs

Research date: 2026-09-29. Sources are checked-in governance, installed framework
docs, current implementation and a read-only review of `../turas-back`, as
requested. No legacy app was run and no database, credentials or private records
were inspected. These findings establish design inputs, not runtime validation.

## R1 — Extend the existing governed application

**Decision**: Add a plans domain to the current Next.js/eve application, using the
installed TypeScript, pg and Zod stack. Keep domain policy independent of HTTP,
UI and tools. No new service, connector, model client or package is needed.

**Rationale**: `lib/server/profiles/commands.ts`, `policy.ts` and
`lib/server/conversations/dispatch.ts` already provide transactions, current
actor checks and idempotent operations. Installed eve `docs/tools/overview.mdx`
confirms tools run in the app runtime and interrupted steps may rerun. Next's
installed `docs/01-app/01-getting-started/15-route-handlers.md` and
`02-guides/data-security.md` support thin routes over server policy and minimized
DTOs. Preserve installed versions and `agent/agent.ts` selection.

**Alternatives considered**: A separate planning service, direct model SDK calls,
and a new workflow orchestrator duplicate existing policy and recovery. No named
external integration is introduced, so no registry installation is justified.

## R2 — Reuse legacy invariants, build the missing lifecycle

| Legacy reference | Finding | 006 disposition |
| --- | --- | --- |
| `../turas-back/agent/skills/delivery-methodology/SKILL.md:94` | Charter, two tracks, acceptance, ownership, stop/rollback and learning | Adapt a short used eve delivery-planning skill and enforce the twelve-section fresh template |
| `../turas-back/lib/solution-patterns/schema.ts:19` | Exact versions, request IDs, rationale and target context hash | Preserve command invariants with environment/workspace/actor scope |
| `../turas-back/lib/solution-patterns/schema.ts:31` | Complete fit dimensions; unknown/incompatible prerequisites block approval | Explicit fit assessment for reused solutions; do not add financial calculations |
| `../turas-back/lib/solution-patterns/repository.ts:39` and `:141` | Request hash replay, version checks and current source checks | Use fresh domain transactions and durable minimal receipts |
| `../turas-back/lib/solution-patterns/repository.ts:15` and `:124` | Read-time publication/source/context eligibility | Recheck plan dependencies for each reader and current use |
| `../turas-back/agent/tools/review_solution_application.ts:10` | Exact adaptation preview distinguishes approval from delivery outcome | Keep that distinction; 006 decisions are human HTTP/UI actions, not an agent acceptance tool |
| `../turas-back/agent/subagents/implementation-research/instructions.md:5` | Context, alternatives, assumptions, handoff and evidence | Reuse content requirements in the used planning skill, no runtime subagent needed |
| `../turas-back/app/planning/page.tsx:1` | Re-exports a synthetic operating model | Do not port it as plan persistence |
| `../turas-back/app/memo/page.tsx:66` | Engagement planning is explicitly future work | Create canonical plan/engagement/baseline entities in 006 |
| `../turas-back/tests/solution-patterns.test.mjs:12` | Validator-level tests only | Port expectations plus real transactions, races, access and lifecycle tests |
| `../turas-back/tests/ui/design-memo.spec.ts:3` | Informational layout checks | Retain visual language; test real author/review/revise journeys |

**Decision**: Preserve exact-revision, context-hash, fit and retry invariants;
implement the new lifecycle against current contracts.

**Rejected reuse**: `lib/solution-patterns/database.ts:7` performs request-time DDL.
`lib/decisions/repository.ts:15` uses unscoped synthetic replay and memory fallback.
Legacy owner/steward authority and synthetic data do not implement current grants,
partner visibility or durable acceptance. Do not copy them or their model settings.

## R3 — Canonical engagements remain separate from descriptive profile references

**Decision**: Add `engagements`, plan revisions, exact decisions and immutable
milestone baselines. Keep current `engagement_reference` profile records unchanged.
First acceptance creates an engagement; a later plan revision keeps that identity.
The domain also supports linking a pre-existing same-scope canonical engagement
with no baseline, without exposing a new engagement-creation workflow in 006.

**Rationale**: `lib/contracts/profile-payloads.ts` has only a descriptive
`engagement_reference` payload; it is not a tracked engagement. Multiple engagements
may share a customer/workload, so uniqueness belongs on plan/engagement linkage,
not on the customer. `customer_workloads` already has scoped keys and an active/
merged lifecycle; merged workloads require explicit new selection before planning.

**Alternatives considered**: Promoting an arbitrary profile note would bypass fact
review and could manufacture a commitment. Reusing one engagement for every plan
under a customer would collapse distinct initiatives.

## R4 — Separate authorship, visibility and human decision authority

**Decision**: Use the specification's explicit administrator-only planning default;
no user confirmation is claimed. Internal members author and inspect
customer plans; partners author delivery plans for assigned customers and see their
own drafts plus accepted delivery revisions. Draft collaboration between different
partners is deferred. Plan audience is immutable; acceptance includes an explicit
delivery-suitability attestation when that audience is delivery.

**Rationale**: `lockProfileActor` checks the current session, role, workspace,
customer and grant under locks. `requireSteward` allows assigned stewards and is
therefore broader than the proposed plan decision capability. Use a dedicated
`requirePlanReviewer` check. Manual prose requires human audience review even if
all machine-supplied evidence is filtered.

**Alternatives considered**: Read access is not plan acceptance authority. Publishing
all drafts to assigned partners could disclose unreviewed internal text. Automatic
redaction cannot guarantee that a generated plan is safe for a broader audience.

## R5 — Bind audience before the first model context

**Decision**: Every admitted drafting request creates a fresh owned planning
conversation with explicit customer, workload and effective audience. Internal
users may choose delivery-only context; partners cannot choose internal context.
Plan tools require this binding. Ordinary chats can link to the planning action
but cannot save a plan from unrestricted history.

**Rationale**: Current `profiles/attempt-context.ts`, `retrieval/policy.ts` and
`conversations/context-fence.ts` derive audience from actor kind. An internal
conversation is already contaminated for delivery-only generation even if later
search calls filter their results. Extend profile, research, retrieval and artifact
context entry points to honor the immutable planning binding. No unverified
attachment selection or unrelated historical chat is admitted into that session.

**Alternatives considered**: Relabeling a conversation or filtering only the final
output cannot remove internal information already in model context.

## R6 — Durable dependencies and conservative read projection

**Decision**: Store plan-owned source identities, exact revisions, locators,
digests, quality/date inputs and assertion mappings. Keep private transitive shared
lineage server-only. At save, resolve ephemeral citations into these dependencies;
at read, reauthorize the current reader against originals. For generated content,
record all context dependencies for the whole revision in addition to assertion
citations. If any dependency becomes prohibited or unreadable, withhold the entire
revision body, including diagrams, narrative summaries and baseline payloads derived
from it. Minimal scope-authorized decision IDs/digests remain inspectable. Freshness
aging alone permits a labeled historical read while blocking critical current use.

**Rationale**: 005 citations are actor-owned and expire; storing their IDs alone
breaks durable sharing. Free prose may depend on more than its nearby citation.
Conservative whole-body withholding avoids claiming safe selective redaction.
An eligible replacement revision is the recovery path, not mutation of history.

**Alternatives considered**: Permanent copies of source text bypass withdrawal;
embedding plans into ordinary accepted-fact retrieval promotes proposals. 006
introduces a dedicated plan read path, not new factual evidence projections.

## R7 — Structured design artifacts without executable markup

**Decision**: Version node/edge diagrams and design-decision records inside the
plan payload. Render a deterministic SVG from an allowlisted structure using React
text nodes and fixed shapes, plus a fully accessible component/flow table. Edit
through bounded forms; no drag/drop editor, arbitrary SVG, HTML, Mermaid execution
or external images are accepted. A context or container diagram is sufficient.

**Rationale**: No diagram library exists in the installed app. The node/edge model
meets technical-design needs with safe rendering and meaningful validation without
a package or parser dependency. Diagram snapshots are part of the exact reviewed
digest. Design links use checked HTTPS or governed artifact references.

**Alternatives considered**: A full diagramming canvas adds editing/accessibility
scope. Untrusted Mermaid/HTML/SVG requires another execution and sanitization
boundary. Exported documents are a later feature.

## R8 — Atomic acceptance and immutable replacements

**Decision**: Under the existing actor/customer locks, acquire plan and intended
engagement locks and current source/lineage locks in the established deterministic
order. Recheck expected version, submitted revision/digest, source readiness token,
authority and content completeness. One transaction records the decision, creates/
links the engagement, writes a milestone baseline, advances pointers and returns a
minimal durable receipt. Unique constraints protect races with different keys.

**Rationale**: Client retry protection alone cannot prevent a second acceptance.
Keep current accepted and working revision pointers separate, so a new draft never
silently replaces an engagement baseline. A replacement uses the same transaction
and engagement and retains prior baseline identity.

**Alternatives considered**: Async engagement creation after acceptance leaves a
partially committed decision. Overwriting milestones loses the agreed baseline.
No event bus is needed for a single database transaction.

## R9 — Reuse bounded eve turns, do not launch another model loop

**Decision**: Add `read_delivery_plan` and `save_delivery_plan_draft` plain eve tools
backed by the plans domain, plus a short on-demand delivery-planning skill. UI
admission creates a drafting record linked uniquely to the response attempt.
Retain the existing 120-second turn deadline, one draft save per attempt, bounded
input/context/output and no automatic paid-call retry. Existing cancellation,
watchdog and uncertain-send reconciliation settle the drafting record; inspect a
saved receipt before treating a lost acknowledgement as unsaved.

**Rationale**: Installed eve docs explicitly allow interrupted steps to rerun.
Use attempt-derived idempotency, current source checks, abort propagation and a
final cancellation check inside the save transaction. Existing turn deadlines plus
maintenance settlement remain within the spec's five-minute ceiling.

**Alternatives considered**: A nested model call or automatic repair loop duplicates
cost/retry state. Tool approval cannot substitute for application idempotency.
Turi receives no acceptance tool. Missing research uses 005's inert preview flow.

**Budget API verification**: Installed `docs/agent-config.md` and
`docs/guides/dynamic-capabilities.md` document a throwing `step.started` model
resolver stopping before the provider call. `dist/src/public/definitions/hook.d.ts`
describes ordinary hooks as observe-only. Use the dynamic resolver plus the
installed AI SDK `wrapLanguageModel`/`transformParams` output clamp for planning
steps, preserving the same model ID and reasoning. Persist at most six step
admissions and clamp each call to 4096 output tokens; no direct nested model loop.
Session usage limits are checked after a call and permit budget renewal, so they
are not the sole drafting budget. The existing eval fixture uses overridable
defaults and omits reasoning; 006 must exercise the actual limiter and record
actual usage rather than copying that fixture unchanged.

## R10 — Explicit rollout, isolated tests and honest evidence

**Decision**: Reserve migrations 029–031 and a 006-only readiness/disable gate;
do not raise the global schema minimum (13) used by earlier features. Extend runtime
role grants and controlled payload retention. Validate 028→031 and empty setup on
clones of the marked disposable Neon test database (or CI's disposable local PG17).
The app Preview database may receive only an explicit inspected upgrade after those
gates; no test target may alias it. Production is excluded by existing guards.

**Rationale**: `tests/fixtures/database.ts` verifies marker, test name and environment
separation. `scripts/retrieval-eval-environment.ts` already supports private app and
Neon clone isolation but has 005 paths/schema constants that must not be reused
unchanged. Preserve the paired database, private artifact store and `.eve` workflow
state across recovery. The two removed OrbStack Postgres containers stay removed.

**Alternatives considered**: Using Preview as a test fixture would violate the
user's boundary. Runtime initialization and down-migrating populated data are not
rollback. Disable 006 intake, preserve history, and forward-repair or restore a
matched disposable/authorized snapshot as appropriate. No Vercel operation is
needed for planning or the implementation acceptance slice.
