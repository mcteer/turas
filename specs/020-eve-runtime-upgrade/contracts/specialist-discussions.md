# Contract: Owned Specialist Discussions

**Contract Version**: `specialist-discussions-v1`

## Scope and Authorization

All browser requests use existing authenticated sessions and mutation-origin
checks. Resolve the conversation under environment/workspace/owner restrictions
before retrieving task data. Recheck customer grants and eligible source/result
visibility on every read/control. Return the same 404 for absent or out-of-scope
references. No administrator exception to conversation privacy. Native task/run
IDs, URLs and model-provided identifiers never grant authority.

## List Status

`GET /api/conversations/{id}/specialists?cursor={opaque}`

Return 200 with `contract`, `items` and optional `nextCursor`; at most 50 items
per page, newest assignment first, using a stable timestamp/ID cursor. Each item:

```text
discussionId, specialistKind, assignmentId, state,
canContinue, canCancel, reasonCode, updatedAt
```

State is `admitted | working | waiting_input | stopping | completed | failed |
cancelled | unavailable`. `completed` with `canContinue: true` means the result
settled and the discussion remains eligible. Expired/invalidated discussions
cannot continue. Only safe authored labels/reasons reach the UI; no raw tool
arguments, source payloads, child reasoning or workflow IDs. Responses are private
and non-cacheable. This endpoint never calls a model or launches research.

## Stop One Discussion

`POST /api/conversations/{id}/specialists/{discussionId}/cancel`

Body: `{ requestKey: UUID }`. Existing CSRF/origin and rate rules apply. Validate
ownership, mark stopping and fence paid admission in a transaction, then invoke
the public durable Stop hook bound to that workflow. The hook token stays server-side; the existing workflow returns and closes its owned child. Browser-supplied hook/run/task
IDs are not accepted. A crash after marking stopping is recoverable by existing
reconciliation; no database lock remains held during I/O.

- 202: accepted but terminal evidence pending; return `state: stopping`.
- 200: already settled/closed or actual terminal evidence observed; return its
  true outcome, including completed if completion won the race.
- 400/401/404: malformed, unauthenticated, or missing/out-of-scope request.
- 503: native control unavailable; retain the admission fence and safe state.

Repeated identical request keys return the same owned outcome. Cancellation is
safe to reconcile; it does not authorize retrying a provider call. Targeted Stop
closes this discussion. Conversation-wide Stop/retirement closes all its owned
discussions, including idle ones, and preserves all cost holds.

## Follow-Up Through Turi

No second browser chat transport is added. The user's ordinary message follows
existing admission and idempotency. Turi receives only the eligible owned task
references needed to select the requested specialist. It calls the same authored
specialist tool with `message` and Eve's generated optional `taskId`.

Before child dispatch, the domain resolves the current reservation and checks
discussion owner, customer, parent conversation, specialist purpose, cumulative
allowance, original expiry and all retained source dependencies. An invalid,
closed or expired target returns an actionable unavailable result without a new
child, paid call or automatic retry. Changing customer/purpose requires a fresh
explicitly requested assignment. Parallel work is allowed only for separately
admitted discussions; same-discussion calls are serialized and deduplicated.

## Native Result and Progress Mapping

| Native Evidence | Domain Meaning |
| --- | --- |
| `task.started` with original call ID | Correlate trusted task binding; not proof of result or permission. |
| `call.started` | The admitted assignment reached its discussion. |
| `interaction.opened` / settled | Waiting for user input; only actual accepted/declined decisions authorize their existing effects. |
| `call.settled` | Settle assignment from actual outcome, after validating signed results and complete commit. |
| `task.ended` | Close discussion with actual outcome; reconcile outstanding accounting independently. |
| Cancel HTTP receipt | Stopping only, until terminal evidence is available. |

One receive/validated result produces one `ctx.reply`; native task delivery drives
Turi's synthesis. Do not add `ctx.continue` or a model polling loop. Duplicate
`outputOf`/replayed settlements resolve to the original assignment result. The
five-second fixture target measures result availability after native settlement,
not provider response latency or guaranteed completion of Turi's synthesis.

## UI and Compatibility

Show a concise specialist label, state and per-discussion Stop next to chat
activity. Waiting input uses the existing question controls. Keyboard focus,
accessible names and live-region announcements work in both themes and mobile
layouts. Keep composer drafts intact across updates/reload. Distinguish closing
an idle discussion from stopping active work in the control label. The existing
conversation Stop remains available. Protocol-25 history stays read-only and
exposes no new continuation/cancellation authority.
