# Data Model: Specialist Discussions

## Existing Records

Keep conversations, response attempts, context receipts, research requests,
signed artifacts and usage-operation ledgers as the governing records. Migrations
082/083 identify native protocol and store complete fact positions. No old native
session is rebound. Proposed migration 084 adds the records below with explicit
runtime grants and environment/schema readiness updates.

## Specialist Discussion

Proposed table: `specialist_discussions`.

| Field Group | Fields and Rules |
| --- | --- |
| Identity | UUID `id`; environment, workspace, owner principal, conversation and customer IDs; specialist kind. All scope fields immutable. Customer is the authorized request account even when the parent chat has no selected customer. |
| Native binding | Parent session ID, first call ID, unique workflow run ID, child session ID and native task ID. Set each once from trusted runtime observations; missing bindings mean pending/unavailable, never an invitation to launch a duplicate. |
| Authority | Original attempt/research lease identity, created time, immutable expiry, admitted context digest and source-dependency revisions. Original expiry is the minimum of ten minutes from creation, original research lease expiry and login expiry. |
| Lifecycle | `open`, `stopping`, `closed`, `failed`, `expired`; close reason and timestamps. `open` can have an active or completed assignment. |
| Limits | Immutable input/output/cost ceilings copied from the existing worker policy, tightened by application authority. No increase on follow-up. |
| Concurrency | Version and current assignment reference; at most one nonterminal assignment per discussion. |

Enforce composite scoped foreign keys or equivalent transactional checks; do not
allow a foreign conversation/account to be attached by an untrusted identifier.
Index owner/conversation and active expiry. Keep identities unique within their
environment. Native IDs and internal source lists are excluded from browser DTOs.

The discussion retains a cumulative dependency set for everything the child has
seen. Recheck grants and every retained dependency before each call. A successful
assignment may advance the baseline solely for its own verified published output,
after current eligibility checks; it may not erase older dependencies, adopt an
unrelated changed source silently, widen scope or renew expiry. Otherwise its own
publication could invalidate every refinement, or a reset could hide withdrawal.

## Specialist Assignment

Proposed table: `specialist_assignments`.

| Field Group | Fields and Rules |
| --- | --- |
| Identity | UUID `id`, discussion ID, ordinal, current response attempt ID, client/request admission identity and payload digest. |
| Native identity | Immutable call ID, accepted delivery ID and child turn ID when observed. Unique call within parent session. |
| Research authority | Request key, lease ID, current context receipt and original expiry snapshot; preserve the historical lease even when cache rows are refreshed. |
| State | `admitted`, `working`, `waiting_input`, `stopping`, `completed`, `failed`, `cancelled`, `unavailable`. |
| Result | Validated signed reference, safe reason code, terminal native position and result-delivery receipt. No private transcript or raw exception text. |
| Accounting | Links to existing provider/research operation IDs; unique operation ownership. Cost unknowns remain unknown, with their ceiling held. |

Unique `(discussion_id, ordinal)`, call ID and idempotency identity prevent
duplicate work. Reusing an idempotency key with a different digest is a conflict.
Exact duplicates return the existing assignment; uncertain delivery is reconciled
from native records instead of resent. A concurrency conflict does not queue
another paid assignment invisibly.

## Admission and Accounting

For each initial request/follow-up, lock the conversation, discussion, assignment
and accounting rows in that order. Recheck current actor, customer grant, source
eligibility, response authority, fixed discussion expiry and remaining allowance.
Deduct reservations atomically before dispatch. All paths that reserve specialist
provider/research work must use the same discussion gate, including tools and
recovery. Aggregate existing measured spend plus full unresolved ceilings across
all assignments; native session usage is an additional limit, not a replacement
for durable admission. Preserve the existing conversation allowance too.

An admission transaction commits before external I/O. Record accepted identities
without treating acceptance as completion. Settlement is idempotent by existing
operation receipt; never release unknown usage because a task closed or failed.

### Durable Operation Reservations

`specialist_operations` records assignment/discussion linkage, the unique native
step identity, selected model, pricing observation, input/output/cost ceilings,
complete actual usage when available and settlement time. Identity and populated
settlement are immutable. This is an admission projection of native/provider
receipts, not a billing system. A repeated step identity cannot dispatch again.
Incomplete receipts retain every original ceiling; an observed overrun is
recorded truthfully and blocks later work.

The conversation's existing ordinary-chat allowance remains enforced. A separate
cumulative specialist backstop is the sum of the three existing worker envelopes
(1,200,000 input tokens, 92,000 output tokens and 8,000,000 micro-USD). Replacing or
closing a discussion cannot replenish it. Per-worker envelopes are unchanged and
shared between native session limits and domain admission. Reservation and
settlement use conversation → discussion → assignment → operation lock order.

## State Transitions and Observations

- Discussion: `open → stopping → closed`; `open → expired/failed` when evidenced.
  Closing first removes future admission. Terminal discussions never reopen.
- Assignment: `admitted → working ↔ waiting_input → completed/failed`;
  active states may enter `stopping → cancelled`. Completion racing with Stop
  remains completed if native evidence proves it; the discussion still closes.
- `call.settled` finishes an assignment, not necessarily its discussion.
  `task.ended` finishes the native task. Distinguish settled work from follow-up
  availability in the DTO.
- Project native protocol-27 facts by complete `(session,line,index)` identity.
  Fold a whole commit before status/accounting settlement. Duplicate/out-of-order
  callbacks use stored cursors and idempotency; partial commits cannot confirm Stop.
- Cancel, expiry, access/source invalidation, global Stop and conversation
  retirement fence further provider calls immediately in domain admission.
  A missing runtime terminal receipt leaves visible stopping/unavailable status;
  reconciliation may retry idempotent control, never uncertain paid dispatch.

## Retention and Migration

Use the conversation's existing retention/deletion lifecycle for discussion
metadata. Purge private result content with its governed artifact; retain only
permitted audit/accounting identities. No raw child messages enter routine logs
or new status records. Backfill no reusable discussion from an old cache row or
protocol-25 session. Rehearse migration/grants and coordinated recovery before
applying to any hosted target.

### Durable Stop Binding

A discussion also retains an immutable, unique server-only `control_hook_token`.
The native workflow registers it before dispatching child work and races that
hook against work, receive and its original expiry. Authenticated Stop and the
existing signed maintenance lane may signal it after fencing admission. A
cooperative reply does not prove termination: only the native task/session end
closes the discussion. `control_next_attempt_at` and `control_attempts` bound
cleanup retries; they never admit provider work or release usage holds.

This replaces the initially proposed direct `getRun.cancel()` control: actual
local native tests accepted that SDK cancellation without producing a native
parent task-end event. The public hook lets the authored workflow exit normally
and leaves final confirmation to actual native facts.
