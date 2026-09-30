# Plan drafting and context contract v1

## Admission and authority

The UI starts a bounded drafting attempt for an existing plan revision using
`POST /api/plan-drafting`. Server checks plan authoring capability, source state,
expected version and rate limits, then creates a fresh owned planning conversation
and response attempt through the existing durable dispatch path. Binding fixes
plan ID, customer, workload, audience, base revision, owner and request digest.
A model cannot create or broaden this binding. It cannot reuse an ordinary chat.

Internal author + delivery plan gets delivery context from the first injected
message. A partner can never receive internal context. Customer-wide context may
be used alongside the selected workload; other workloads are excluded. No private
chat search, unverified attachment context, raw original files or unrelated
research history enters a planning session. An internal plan uses internal context
only for its currently authorized author and remains internal.

Extend the existing profile snapshot, retrieval source policy, research reads,
conversation repository/projection and stream/replay checks to carry an effective
audience and workload derived from this binding. Keep actor identity untouched;
do not impersonate a partner to select the delivery projection. Existing normal
conversations continue to derive audience as before.

## Context and durable consumption

`plan-context-v1` includes contract/template version, exact plan/base revision,
allowed draft metadata, current authorized customer/workload facts, attributed
research, shared practices, source IDs/generations/digests/locators, quality/date
bases and known gaps. Evidence context is at most 24,576 total UTF-8 bytes across
injection and tool reads for the attempt, with at most 40 source dependencies and
four governed retrieval calls. Repeated content is deduplicated before accounting;
truncation is explicit and cannot be reported as complete coverage.

Plan content being revised is separately bounded by the 131,072-byte payload cap;
withheld/purged input is never supplied. A draft-too-large result is actionable;
no unbounded continuation loop. Persist the union of all consumed dependencies,
not only the final citations, and compare current source closure before every
provider admission, draft save, emitted chunk and later generated replay.

## Used agent surfaces

- `read_delivery_plan`: server-bound plan/revision read, bounded eligible body or
  structured section selection; records durable dependency consumption. It cannot
  choose a different customer or expose unaccepted drafts to another partner.
- `save_delivery_plan_draft`: strict structured draft content and source mappings;
  domain loads scope/base/audience/owner from the admitted attempt. At most one
  saved revision per attempt. Key derives from the application attempt, not a
  model-generated request ID; changed replay payload conflicts. It returns IDs,
  version, validation summary and review link, never an acceptance result.
- `agent/skills/delivery-planning/SKILL.md`: short used procedure adapted from
  legacy methodology: outcome/ownership, value and production tracks, fit and
  alternatives, unknowns, evidence, handoff, rollback and explicit human decisions.
- `agent/instructions/plan-context.ts`: inject the validated binding, template and
  context budget; root instructions only route planning intent to this procedure.

Existing customer/research/retrieval tools must enforce effective audience and
workload when a planning binding is present. Tools that propose unrelated profile
or artifact changes reject planning-session use; research execution has no admitted
research request there. `propose_research` may return an inert public preview for
starting the separate 005 research flow. Preserve the existing disabled bash,
read_file, write_file, web_fetch, web_search and agent/delegation tools. No new
connection, runtime subagent, search provider or acceptance tool is installed.

## Model and execution budget

Retain the exact selected root model and `reasoning: low`. Add a documented eve
`defineDynamic` model resolver for `step.started`, backed by
`lib/server/plans/model-budget.ts`. For ordinary turns return the same configured
model; for a planning attempt, reauthorize context and atomically admit at most
six logical model steps against the current deadline and cancellation state.
A throwing resolver stops before the provider call. Return the same model wrapped
by the installed AI SDK middleware, clamping `maxOutputTokens` to 4096 on each
planning call even if an incoming setting is larger.

Persist `(attemptId, turnId, stepIndex)` admission and provider operation state.
The wrapper marks an operation started before invoking its provider; completed
calls are reconciled from existing durable events. A second actual provider call
for an already-started uncertain operation is denied, not silently retried.
Test native replay as well as ordinary calls; do not assume resolver invocation
itself equals a new provider call. Known pre-provider failures may be retried only
within the same still-unused admission; ambiguous calls become unconfirmed.

The existing dispatch deadline is 120 seconds. Cancellation and watcher settlement
must produce a terminal/unconfirmed outcome within five minutes, and no save after
cancellation/expiry commits. The model may emit up to 24,576 output tokens across
six clamped calls; actual usage, including provider-visible retries, is recorded.
Missing usage is unknown, not zero. The eight-case live evaluation has a 20-minute
suite ceiling; no automatically repeated paid cases. Use the actual runtime limiter
in the isolated app, not an eval-only altered model or reasoning setting.

## Save, cancellation and replay

Within the save transaction, lock the attempt, reauthorize owner/session/customer,
check exact base version and full dependency union, then persist the immutable
revision and saved receipt once. The UI cancellation transaction uses the same
attempt lock; a save committed before cancellation stays saved, while cancellation
committed first prohibits later save. Final chat acknowledgement is separate from
canonical result persistence.

If the process restarts during an admitted turn, preserve native state and application
receipts. Existing development-generation quarantine may leave an unconfirmed turn;
it does not authorize dispatching again. A saved result is recovered by receipt.
An explicitly requested new draft starts a fresh admitted attempt after inspection.

Source and plan dependencies are checked at dynamic model admission, every governed
tool, stream chunk, title/history projection and resume/replay. A plan revision used
in a later conversation creates a dependency on that exact revision and its source
closure; supersession marks current guidance stale and requires a fresh session.
Source withdrawal withholds affected generated content through the existing native
state retirement/quarantine path. No remote provider erasure is claimed.
