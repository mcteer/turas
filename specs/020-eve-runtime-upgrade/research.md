# Research: Eve 0.91 Upgrade

**Date**: 2026-11-01. Sources: installed Eve 0.91.0 public docs and repository
code. Prior research-agent findings were checked against the installed workflow
and task pages. Supported APIs still require real runtime integration tests.

## Reusable Specialists

**Decision**: Change the three existing workflow tools from `task` to `serve`;
keep one `ctx.agent(name)` handle and process assignments sequentially. Use the
framework-added optional `taskId` for continuation, with domain-owned bindings
and current authorization before sending.

**Rationale**: `ctx.reply` settles the assignment and leaves the task idle. Later
calls update auth/turn and send to the same child. Returning ends the workflow
and child. Native tasks already deliver results to the parent once. `serve`
cannot yield progress. Do not declare `taskId` in the input schema or use the
obsolete unused `agentId` input for continuation.

**Alternatives**: New children lose continuity. `ctx.continue` duplicates result
handoff. Polling is unnecessary for owned native tasks; preserve the old join path
only where a non-native shared request still needs it.

**Sources**: `node_modules/eve/docs/tools/workflows.mdx` (Resumable tasks, Receive
calls and reply, Calls from several callers, Delegate work),
`node_modules/eve/docs/tools/tasks.md`,
`agent/lib/legacy-research/specialist-workflows.ts`.

## Identity, Evidence and Budget

**Decision**: Add discussion and assignment identities. Recheck owner,
conversation, customer, purpose, context digest, source dependencies and current
reservation on each receive. Changed/withdrawn context ends reuse; fresh work
requires explicit user intent and admission.

**Rationale**: Native tasks belong to the session, not the starter user. Research
request rows replace worker/lease bindings and cannot alone identify a reusable
child or prior assignment. Preserve each worker's actual cumulative limits and
ten-minute timeout; tighten to any earlier original authority/login expiry.
Follow-ups cannot extend expiry or reset spent/held amounts. Each paid dispatch
needs both existing conversation accounting and a discussion aggregate check.

**Alternatives**: Trusting task IDs permits cross-user control. A fresh prompt
does not remove withdrawn content from child history. Resetting allowances per
follow-up permits unbounded spending. Link existing operation receipts instead
of adding a separate billing system.

**Sources**: `lib/server/research/specialists/runtime-authority.ts`,
`research-cache/requests.ts`, `agent/lib/authorize-specialist.ts`, the three
worker `agent.ts` files and `docs/evidence-policy.md`.

## Targeted Cancellation and Progress

**Decision**: Persist `getWorkflowMetadata().workflowRunId`; use public
`getRun(runId).cancel()` behind domain ownership checks. Correlate task IDs through
`task.started.startedBy.callId` and `call.started`. Project complete native facts
into concise status without private child content.

**Rationale**: Public `Session.cancel` is turn-wide. Custom-channel `invokeTool`
cannot call framework/workflow tools such as the built-in task cancel. Cancelling
an owned workflow avoids extra model calls and private imports. Child sessions
end with their workflow. Integration must prove parent-task settlement and that
unrelated work continues; cancellation acknowledgement is not terminal evidence.

**Alternatives**: Model-mediated Stop adds latency/cost; raw child streams expose
private content; invented percentages lack evidence. Do not catch cancellation
and resume the receive loop: cancelled discussions close in this feature.

**Sources**: Installed `tools/workflows.mdx` (Workflow imports; Cancel and clean
up), `tools/tasks.md` (Cancel a task; Stream events), `channels/custom.mdx`.

## Runtime Compatibility

**Decision**: Keep protocol provenance and complete `(line,index)` positions;
settle usage after a complete commit; defer admission until instructions are
assembled but before provider dispatch.

**Rationale**: Installed 0.91 dynamic model selection precedes instructions and
the committed `model.requested` fact. An earlier team note states the reverse and
must not guide this change. `usage.recorded` can follow `model.settled` in the
same commit. Pre-0.69 sessions cannot migrate natively; preserve saved history.

**Sources**: Installed `runModelStep`/`prepareModelCall` inspected during earlier
compatibility work; `lib/server/models/deferred.ts`,
`lib/server/conversations/eve-events.ts`, migrations 082/083 and installed upgrade
guides on session events/saved history. This is observed 0.91 ordering, not a
guarantee for later versions.

## Deferred and Excluded Capabilities

The [spec adoption matrix](spec.md#capability-adoption-assessment) records useful
additions and exclusions. No new connector, Clear Chat feature, external
approver-credential feature or second continuation mechanism is needed. Verify
inherited approval, Anthropic, memory/file and client-state improvements where
Turas uses them. No unresolved research question blocks planning; native follow-up
and targeted cancellation remain explicit implementation validation gates.
