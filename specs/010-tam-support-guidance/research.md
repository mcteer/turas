# Research: TAM and Support Guidance

**Date**: 2026-10-04. Read-only code/document review; no runtime or hosted checks claimed.

## R01 — Use Customer/Workload Scope, Not Engagement Identity

**Decision**: A support scope is environment/workspace/customer plus optional workload; engagements are selected input references.
**Rationale**: Roadmap 010 and TR-05 require customer operating ownership and maturity-aware advice, including customers with no active engagement. `lib/server/execution/policy.ts` and `sources.ts` assume an engagement, so reusing an execution workspace as the support record would impose the wrong identity and partner-write policy.
**Alternatives considered**: Put support actions in RAID (cannot represent customer-wide readiness); require a delivery plan first (unnecessary blocker); create a second customer profile (duplicates identity).

## R02 — Reuse Factual Evidence and Maturity

**Decision**: Use existing accepted-profile, approved artifact excerpt, attributed verified research and published shared knowledge source types; adapt exact execution record/baseline references. Maturity assessment is an accepted profile payload, not a separate data source.
**Rationale**: `lib/server/profiles/maturity.ts` validates the six-dimension rubric and evidence dates. `lib/server/plans/sources.ts` resolves audience/workload-limited original references; `lib/server/execution/sources.ts` adds recursive execution/baseline closure. `docs/evidence-policy.md` prohibits model prose and user URLs from becoming facts automatically.
**Alternatives considered**: Copy snippets into a support evidence table (stale copies); cite generated summaries as original facts (loses lineage); average maturity scores (violates product model).

## R03 — Exact Human Review with One Authority

**Decision**: mcteer alone reviews judgments and disposition changes. Panel proposes. Assigned partners read accepted delivery guidance. Owners identify responsibility without receiving approval privileges.
**Rationale**: User clarification confirms approval authority. Existing execution/reports use canonical mcteer identity, live session/customer locks, immutable revisions and idempotent decisions. Support review accepts support judgments; source fact review remains the existing profile/evidence path.
**Alternatives considered**: Allow every internal employee to approve (not the selected answer); an additional approval for merely saving drafts (unnecessary); model-driven completion (not authorized).

## R04 — Manual External References, No Connector

**Decision**: Escalation is advice plus a human-reported handoff field, with external acknowledgement/resolution unknown. HTTPS references are validated and displayed as links only, without fetching, previewing or sending.
**Rationale**: Roadmap says track disposition without pretending to resolve tickets; it names no ticket vendor and requires no service integration. Generic domain tools are the correct Eve capability. Registry installation is unnecessary for a feature with no external connector call site.
**Alternatives considered**: Preinstall ticket connectors (speculative); reuse reporting mail (adds a nondependency and deferred real-delivery gate); implement an incident system (outside 010).

## R05 — Bounded Read-Only Native Advice

**Decision**: Add `support` to the server-owned feature discriminator and use the existing native lifecycle. Three bound reads and one skill; human save creates a pending draft.
**Rationale**: `lib/server/conversations/feature.ts` rejects mixed/populated bindings. `model-admission.ts` dispatches governed steps. `lib/server/staffing/native-admission.ts` exposes compatibility helpers used by the unchanged agent; `model-budget.ts` already dispatches another feature's wrapper. `lib/execution/advice.ts` provides concrete six-step/read, 24 KiB context, 200-source, hourly admission and deadline patterns. Preserve `agent/agent.ts` and its model selection.
**Alternatives considered**: Let ordinary chat use unrestricted tools (weaker budget/side-effect boundary); direct ad-hoc model calls outside Eve (duplicate runtime); clone every execution file (unnecessary duplication).

## R06 — Small Native Authored Surface

**Decision**: Author typed reads via `defineTool` and a load-on-demand `agent/skills/tam-support-guidance/SKILL.md`; route instructions through the feature context.
**Rationale**: Installed `node_modules/eve/docs/README.md`, `tools/overview.mdx` and `skills.mdx` document typed tools, schemas, dynamic visibility and the fact that skill loading grants no authority. Installed Next route-handler guide confirms App Router handlers and uncached dynamic reads; current auth/CSRF/no-store helpers remain required.
**Alternatives considered**: Root prompt expansion for every chat (unnecessary context); new specialist subagent (no independent research need); tools exposing raw SQL/HTTP (unbounded).

## R07 — Read Fences Before Asynchronous Cleanup

**Decision**: Ineligibility is checked synchronously; cleanup is bounded maintenance with exact payload identity, lease and generation checks. Human-readable decision/outcome details are purgeable.
**Rationale**: Existing execution maintenance separates lifecycle metadata from content and never assumes provider completion. The recent reporting follow-up has uncommitted cleanup/fixture work; 010 must not depend on or commit it implicitly.
**Alternatives considered**: Wait for cleanup to hide content (leak window); delete all audit (loses replay/review identity); retain rationale/URLs indefinitely in receipt JSON (defeats minimization).

## R08 — Verification and Plan-Mode Adaptation

**Decision**: Build dedicated support test discovery using shared owned-runner primitives, add explicit earlier-cohort exclusions, verify current manifest versions dynamically, and keep focused local/CI evidence separate from hosted readiness.
**Rationale**: PR17 exposed missing owned-copy dependencies, cohort contamination, absent host validators and stale schema assertions. These are runner lessons, not reasons to skip tests. `scripts/check-docs.mjs` is read-only but checks repository docs only; staged planning docs need a separate read-only link/format/coverage check.
**Workflow adaptation**: Checked-in `.agents/skills/speckit-{specify,clarify,plan,tasks,analyze}/SKILL.md` and active local templates were read. `.specify/extensions.yml`, overrides and presets are absent. The pure `check-prerequisites --paths-only` path was run with the external draft directory; its synthesized branch field is not an actual Git branch. Setup/normal prerequisite helpers persist `.specify/feature.json`, so they are withheld in Plan mode. No repository pointer or files are written.
