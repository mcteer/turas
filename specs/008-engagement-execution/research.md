# 008 design research

Research date: 2026-10-02. Read-only local source and installed documentation review;
no database, model, provider, registry installation or hosted operation was performed.
The planning skill's research delegation examined 006/007 domain and native-advice
extension points. These are implementation decisions, not runtime validation.

## R01 — Extend the governed domain

**Decision**: Add `lib/server/execution` plus pure `lib/execution/calculations.ts` calculations and
strict contracts. Thin Next routes, UI and Turi tools call the same domain.

**Rationale**: `lib/server/engagements/read.ts` already composes accepted 006 plans
and delivery-safe 007 assignments. `lib/server/staffing/policy.ts` excludes partners,
so execution uses current profile/customer authorization with separate contributor,
reader and canonical-mcteer reviewer capabilities. Member/resource uniqueness in
`032-workforce-competencies.cjs` is reused.

**Alternatives**: A second service/database would duplicate authority and source
lifecycle. Calling staffing's internal-only wrapper would break partner submission.
Generic administrator review would exceed the user-confirmed mcteer-only authority.

## R02 — Exact baseline items and explicit reconciliation

**Decision**: Materialize item metadata keyed by `(baselineId,kind,key)` from a
readable accepted 006 payload. Store original item references forever; a new baseline
requires explicit one-to-one/retired/added mapping, without completion transfer.

**Evidence**: `lib/server/plans/baselines.ts` stores arrays, while
`lib/contracts/plan-content.ts` has distinct string-keyed milestone/work-package
arrays and no relationship between them. `lib/server/staffing/engagements.ts` models
authorize→plan lock→governed source read→engagement lock→pointer recheck.

**Alternatives**: Global item UUID assumptions, title matching and automatic mappings
risk false lineage. Splits/merges are represented retired/added in v1 and expose
unmapped actuals; arbitrary graph remapping is deferred.

## R03 — Separate actual ledger and ordered transactions

**Decision**: Actuals use stable per-resource/date lock rows and exact per-entry
approved contributions. Lock the complete old/new subject/date union before any
correction debit/credit, keeping historical actuals independent of planned capacity.

**Evidence**: `lib/server/staffing/ledger.ts` handles first-write serialization through
insert-on-conflict plus sorted locks. `staffing_capacity_days` caps planned load at
960; it cannot store 008's 1440-minute actual policy. `operations-baselines.ts`
documents plans→source union→engagements→demands before workforce locks.

**Alternatives**: Summing unlocked entries misses competing first writes; using the
booking ledger corrupts planned capacity; rejecting all over-booking work makes
actual reporting untruthful. Record exceptions and preserve the cap instead.

## R04 — Reviewed quantities and historical calendars

**Decision**: Enter reviewed integer-minute point budgets and remaining estimates.
Keep whole-engagement actuals, current-baseline variance and resource utilization
as explicitly different scopes. Reuse the pure interval/rounding functions in
`lib/staffing/{calendar,arithmetic}.ts`; retain input revision/timezone identities.

**Evidence**: 006 effort is an unknown value or min/max hour range. `readStaffingOperations`
returns `actual_unavailable`; that planned contract need not change. Calendar
selection is an approved revision per resource/date, with pinned resolver version.
Protected time is not deducted from available minutes a second time.

**Alternatives**: Choosing a range midpoint, summing percentage means, dropping
retired actuals, or treating current resource fitness as proof that past work did
not occur all change the reported truth. Missing/changed denominator inputs remain
explicitly incomplete. A source/timezone change never moves historical minutes.

## R05 — Review and privacy

**Decision**: Strict per-kind record schemas share revision/decision mechanics.
Pending content is author/reviewer only; accepted delivery records remain subject to
source eligibility. Time notes/details are subject/author/reviewer only, while
approved engagement totals can be delivery-visible. No 003 claim is silently accepted.

**Rationale**: The constitution and `docs/evidence-policy.md` separate factual review,
quality and audience. Baseline/source withdrawal withholds prose immediately but
must not subtract approved operational minutes. External acknowledgement is a
reviewed internal record, not an external signature.

**Alternatives**: Generic untyped JSON or shared chat dumps weaken boundaries. Full
personnel time lists for every engagement viewer are unnecessary to establish delivery status.

## R06 — Native advice uses mutually exclusive bindings

**Decision**: Introduce a server-owned conversation feature resolver for
normal/planning/staffing/execution and reject conflicting research/feature bindings
under the conversation lock in both insertion directions. Extend every current
admission/catalog/tool/context/release/settlement surface for execution.

**Evidence**: Existing 007 routing spans `agent/agent.ts`, guard/customer instructions,
`profiles/{attempt-context,tool-actor,context,read}.ts`, and conversation dispatch,
eve routes, projection, reconciliation, repository, context fence and cancellation.
Migration 034 rejects mixed/populated bindings. Adding only tools leaves unsafe
fallthrough into ordinary internal customer context.

**Preserved root agent**: `agent/agent.ts` already imports staffing-named native
scope/admission/model helpers. Keep that file and model/reasoning bytes unchanged.
Add a tagged shared native model dispatcher in `lib/server/conversations/model-admission.ts`;
the existing exports used by the root agent in `staffing/native-context.ts`,
`staffing/native-admission.ts`, `staffing/model-budget.ts` and `staffing/context.ts`
act as compatibility adapters for staffing/execution only. The admitted mode is a
strict tagged union, so execution uses its own fences/budgets/catalog and never
loads staffing data. Unbridged execution fails closed. Migrate other call sites of
`staffingResponseScope` to the new discriminator with an explicit feature check,
including existing dynamic instructions and tool catalogs. Regression tests must
prove the unchanged root agent reaches actual execution admission before provider IO.

**Alternatives**: Reusing staffing-specific dependencies directly would erase the
008 distinction between withdrawable prose and persistent actual minutes. A broad
framework rewrite is unnecessary; share only identical binding/admission mechanics.

## R07 — Bounded explanations and source fences

**Decision**: Three tools (summary, reviewed records, effort) plus one permitted
procedure, internal one-engagement scope, six steps/reads, 4096 output tokens/step,
120 seconds, 24576 cumulative context bytes and 200 dependencies. Procedure loads
count toward reads/bytes. Preserve durable one-use provider admissions and no retry.

**Evidence**: `lib/server/staffing/{model-budget,model-admission,native-release,fences}.ts`
provides tested patterns. `readStaffingDeliveryContext` avoids charging the normal
profile-read quota for each native chunk while preserving current actor/source
locks. Execution must extend this internal admission-aware path without a client
quota-bypass flag. Native settlement copies metadata only; actual usage may be unknown.

**Alternatives**: Prompt-only tool restrictions, unmetered skill loads, repeated user
quota charging, or paid retransmission on reconnect fail the same boundaries 007
already protects. Normal model and reasoning remain `spacexai/grok-4.7` / `low`.

## R08 — Validation and recovery use owned environments

**Decision**: Build an 008 wrapper over existing owned-copy/evaluation mechanics with
an explicit schema-034 source fixture and an empty fixture. Copy only marked test
sources and owned stores; add a manifest-enforced suite, CLI WebKit matrix, arithmetic,
load, paired recovery and bounded live runner with actual output review.

**Evidence**: `scripts/staffing-eval-environment.ts` has feature-specific regex and
schema-031 setup, so it cannot simply be renamed at the caller. Existing regression
runner covers only through 006; 008 needs explicit 007 regression coverage. The
legacy Playwright selector must exclude owned 008 UI while the dedicated runner
requires all four projects with zero skips/retries. Prior 007 CI discovery failures
are a concrete reason to verify both selectors.

**Alternatives**: Using configured Preview for destructive testing, claiming mocked
native output as live evidence, or a blanket skipped browser selection is unacceptable.

## R09 — Local framework documentation and legacy review

Installed versions read from local packages: Node 24 project runtime, Eve 0.67.1,
Next 16.3.4, React 19.2.6, pg 8.23.0, Zod 4.5.4, Temporal polyfill 0.5.1. Reuse the pinned
lockfile; no new package or external integration is needed.

Read the installed Eve docs index, tools overview, skills and eval overview, and
Next route-handler guide. Implementation must route through the current installed
docs before modifying code, including client/server boundaries and native protocols.
This research does not claim future package behavior or hosted verification.

Read only the legacy delivery-methodology and engagement-health-and-risk procedures,
alongside `docs/legacy-review.md` and `docs/design-reference.md`. Preserve distinctions
between evidence, risk, decision and outcome; explicit owners, dates and handoff.
Do not port legacy stage enums, scoreboards, automated escalation, fixtures, credentials,
model choices, complete procedures or unsupported acceptance claims. No legacy code
is the implementation base. No unresolved research question blocks this design.
