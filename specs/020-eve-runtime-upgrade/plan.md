# Implementation Plan: Eve Runtime Upgrade and Specialist Continuity

**Branch**: `chore/eve-dependabot-composer` | **Date**: 2026-11-01
**Spec**: [spec.md](spec.md) | **PR**: #52

## Summary

Upgrade Eve 0.67.1 to exactly 0.91.0 while preserving authorization, evidence,
accounting, private history and recovery. Adopt reusable specialist discussions
through native `serve` workflows, checking current authority for each call,
showing truthful assignment progress and allowing an owner to stop one discussion.
Keep the requested composer, Dependabot and README work in this PR.

Implementation and acceptance results are recorded in [validation.md](validation.md).
The planning handoff is complete; final-source checks and the reviewed release
decision remain separate gates. Planned behavior alone does not certify a release.

## Technical Context

- **Language/Runtime**: TypeScript 7.0.2, Node 24, React 19.2.6, Next.js 16.3.8.
- **Agent Dependencies**: Eve 0.91.0, AI SDK 7.0.137, existing Vercel AI Gateway;
  preserve selected models and reasoning. Local `just-bash` is installed by the
  lockfile, never during execution or shutdown.
- **Storage**: Existing Postgres domain tables, Eve durable workflow state and
  private artifact/Blob storage. No new service or connector.
- **Testing**: Vitest, disposable Postgres/native-runtime fixtures and CLI
  Playwright/WebKit; authenticated checks on the exact isolated Preview build.
- **Performance**: Idle discussions make no model calls or research polls.
  Controlled fixtures expose a settled result within five seconds. Status reads
  use bounded indexed metadata, not child transcripts.
- **Limits**: Preserve worker cumulative session limits and ten-minute timeout.
  Discussion expiry is fixed at creation to the earliest of that ten-minute
  window, original research authority and login expiry. Each follow-up also
  needs a current response/research authority; neither renews the discussion.
- **Scope**: Three existing specialists in ordinary chat. Governed feature chats
  retain current restrictions. Conversations remain owner-private for all roles.

## Constitution Check

| Principle | Before Design | After Design |
| --- | --- | --- |
| I: Specification and traceability | Spec and clarification complete; earlier compatibility work predates the request for this spec. | Tasks cover requirements and useful capability adoption. |
| II: Customer outcomes | No maturity/commercial calculation changes. | Research keeps its customer and purpose. |
| III: Evidence lifecycle | Existing evidence policy applies. | Recheck sources/context before continuation and provider calls; invalidate unsafe retained context. |
| IV: Server authorization | Native task IDs are not credentials. | Domain checks environment, workspace, owner, conversation, customer and purpose. |
| V: Decision rights | No new approval/send authority. | Replayed or interrupted questions cannot authorize effects. |
| VI: Eve core | Installed workflow/task docs reviewed. | Native serve/reply lifecycle and public durable Stop hook and native task-end confirmation; no private imports or redundant continuation engine. |
| VII: Meaningful verification | Real runtime and UI checks required. | Unit, contract, integration, native and hosted evidence distinguished; independent review before merge. |
| VIII: Operability | Existing accounting and explicit migrations. | Fixed expiry, cumulative reservations, cancellation and replay recovery. |

**Scoped workflow exception**: The user explicitly keeps the existing Git branch
and PR #52 instead of a numbered branch. Owner: repository maintainer; scope and
expiry: this PR only. Select the feature with
`SPECIFY_FEATURE_DIRECTORY=specs/020-eve-runtime-upgrade`. No other design
exception is required.

## Project Structure

```text
specs/020-eve-runtime-upgrade/
  spec.md, plan.md, research.md, data-model.md, quickstart.md, tasks.md
  checklists/requirements.md, checklists/clarification.md
  contracts/specialist-discussions.md
agent/
  tools/{customer-recon,implementation-research,vercel-best-practices}.ts
  lib/legacy-research/{specialist-workflows,workflow-progress}.ts
  lib/authorize-specialist.ts
  skills/solution-research/SKILL.md
lib/server/research/specialists/
  discussions.ts, discussion-events.ts, discussion-budget.ts       (new)
  runtime-authority.ts, research-cache/requests.ts
lib/contracts/specialist-discussions.ts                            (new)
lib/server/conversations/
  eve-events.ts, replay-window.ts, projection-position.ts, cancel.ts
app/api/conversations/[id]/specialists/route.ts                    (new)
app/api/conversations/[id]/specialists/[discussionId]/cancel/route.ts (new)
app/_components/{agent-chat,specialist-tasks}.tsx                   (latter new)
migrations/084-specialist-discussions.cjs                          (new)
tests/{unit,integration,contracts}/specialist-discussions.test.ts  (new)
scripts/check-specialist-continuity.ts                            (new)
```

All entry points use the existing governed domain layer. Proposed files are
implementation destinations, not claims that those modules already exist.

## Design and Implementation Sequence

1. **Compatibility (US1)**: Reconcile v27 fact positions, read-only protocol-25
   history, deferred pre-provider admission, question replacement, shutdown and
   upload recovery. The staged 10 MiB restart check now passes in its owned local
   recovery configuration; keep hosted evidence separate as recorded in validation.
2. **Owned discussions (US2)**: Add migration 084 and grants. Bind one workflow
   and child to an opaque discussion ID. Append immutable assignment identities
   and links to existing research/usage receipts. Lock conversation → discussion
   → assignment → accounting; never hold database locks across native I/O.
3. **Serve workflows (US2)**: Keep one `ctx.agent` handle per discussion.
   Sequentially receive, authorize, reserve, send with the call's abort signal,
   validate the result and `ctx.reply`. Persist the workflow run identity using
   `getWorkflowMetadata`. Use current call auth. Keep child history only while
   eligible. Expiry closes the workflow with a durable timer; preserve a raced
   `receive()` promise until read. Do not silently create a replacement child.
4. **Progress and control (US3)**: Project complete native task/call/interaction
   facts into owned status. Add authenticated status/cancel routes and compact UI.
   Cancellation first fences new admission, then signals the server-only durable
   Stop hook using public `resumeHook` from `eve/workflow/api`. The authored
   workflow exits and closes its child; only actual native task/session end
   confirms termination. Direct `getRun.cancel()` was rejected after native
   tests accepted the request without producing parent-task settlement. Prove
   child and parent-task settlement while unrelated work continues. Global
   Stop/retirement closes all owned discussions, including idle ones.
5. **Product changes (US4)**: Preserve the implemented composer; verify task
   controls within it. Preview inherits the production sensitive `mcteer`
   credential record; a local password must not replace it.
6. **Release gates (US5)**: Review Dependabot, docs, explicit schema/grants,
   recovery rehearsal, CI and independent review. Verify the exact Preview source.
   Production promotion follows Preview review and requires its own verification.

See [research](research.md), [data model](data-model.md),
[contracts](contracts/specialist-discussions.md) and [tasks](tasks.md).

## Verification and Recovery

Use [quickstart.md](quickstart.md). Verify one assignment and two follow-ups per
specialist, including restart and no duplicate paid calls. Deny cross-owner,
cross-customer/purpose, revoked-source, expired-authority and exhausted-budget
requests. Exercise two-task cancellation, duplicate delivery, pending questions
and global Stop. Preserve unknown usage as held.

Verify target identity and recovery backup before migrations. Preview started at
schema083 and now has schema084; Production remains schema081. Rehearse
081 → 082 → 083 → 084 and grants on disposable copies. Exact schema checks can
make old binaries incompatible with the new marker: rehearse coordinated
code/schema rollback or forward repair, not only a deployment alias change.
Preserve protocol-25 histories and bindings. Record commit, schema, grants and
authenticated behavior per environment. Clean only task-owned temporary artifacts.

## Complexity Tracking

Separate discussion/assignment entities are needed because a completed assignment
can leave a discussion open. Existing research cache rows replace lease/worker
bindings and cannot provide immutable discussion history. Existing operation
ledgers remain authoritative; discussion aggregates are admission boundaries,
not a second billing system. No additional infrastructure is introduced.

### Recovery Compatibility Found During Acceptance

Migration085 extends the existing immutable recovery model holds and observations
with specialist token/cost dimensions and opaque operation identities. It installs
the existing permanent replay guard on all three specialist tables. Snapshot
inventories are schema-bound: 081–083 retain operational/named-content protections;
084+ include specialist metadata without control tokens, prompts or result bodies.
Restored discussions are retired. Admission folds live operations and inherited
holds once by operation ID, preserving unknown ceilings and cumulative caps.
Authenticated pre-083 whole-line event denials stay broader than the new fact
tuple; current snapshots must still declare the actual complete tuple inventory.
Rehearse 081/084→085 and refresh Preview backup before explicit migration.
