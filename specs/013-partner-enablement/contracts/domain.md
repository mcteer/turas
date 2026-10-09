# Domain Contract: partner-enablement-v1

## Authority matrix

| Action | Internal member | Canonical active internal admin mcteer | Granted partner |
| --- | --- | --- | --- |
| Read customer workspace, eligible guide and minimal history | Workspace authority | Yes | Own current grant, published guide only |
| Draft/submit guide | Yes | Yes | No |
| Publish/reject/retire guide | No | Yes | No |
| List eligible assignment targets; assign/withdraw/replace | No | Yes | No |
| Read checkpoint prose | Current internal customer authority | Yes | Assigned self only |
| Save/submit checkpoint attempt | No | No | Assigned self only |
| Verify/request changes | No | Yes | No |
| Reconcile request | Own currently authorized receipt | Own currently authorized receipt | Own currently authorized receipt |
| Read published shared knowledge | Existing 005 authority | Existing 005 authority | Existing 005 authority, including without grants |

Internal readers never impersonate a partner. Reviewer target selection returns only display name/member ID/organization display label for currently eligible members of the selected customer; no personnel record, roster export or finance information. Existing plan/grant/shared publication authorities are not narrowed to mcteer by this feature.

## Governed service boundary

`lib/server/partners/policy.ts` acquires live actor/session/environment/workspace/organization and customer locks using the established profiles/plans prefix. Include target memberships in the existing sorted membership lock set before principal/session/workspace/organization/customer/grant locks. Resolve IDs only to private scope metadata until authorization succeeds. Unknown and unauthorized target identities are indistinguishable externally.

For writes/review, acquire original-source locks in the existing deterministic kind/ID order before 013 guide/assignment/attempt heads, then compare target/source generations under the same transaction. Reads build private projections while fenced and check current authority/source eligibility before returning. Existing source helpers receiving an already-authorized transaction must not start a second transaction or invert lock order. Do not acquire learning locks and then request an earlier membership/source lock. A revoked target blocks reviewer writes as well as the target's writes. Query counts/search/pagination inside the authorized scope.

`workspace.ts` returns customer reference pages; `listDeliveryEngagementPage` in `lib/server/engagements/read.ts` returns delivery-visible accepted engagement cards under live policy. It uses `(created_at,id)` stable descending keys, not the old unpaged list. Customer discovery uses immutable `id` ascending keys, so a rename cannot move a reference between pages. Cursor authority binds membership and organization revisions plus the customer grant revision for a customer-scoped page; workspace pages reapply current individual grants on each page and never treat the cursor as a grant. Recheck each released reference. No eagerly expanded global engagement tree or inferred hidden total. Link to existing owned plan proposals and execution screens rather than build their action handlers again.

`guides.ts`, `assignments.ts` and `submissions.ts` implement C01–C16 through one command entry point. `projection.ts` is the only new public projection, including review failures. `progress.ts` computes the versioned fraction with current eligible evidence; no writes to maturity, workforce, time, milestones, support, gaps or shared publications.

## Evidence rules

The guide's plan and engagement must match an active accepted delivery baseline. Validate baseline identity/current plan sources before guide reads, publication, assignment and checkpoint decisions. Internal-only plans/sources cannot support a partner guide even when the author can read them.

Source discovery uses existing governed retrieval and accepted execution selection. Re-resolve originals by exact revision/generation/digest/locator; borrowed actor citation receipts confer no authority. Each lesson/checkpoint declares the selected source IDs that support its claims/criteria; each has at least one selected source, and no selected source may be orphaned. Known uncertainties may be explicit text; unsupported critical claims cannot publish. C05 quality and provenance checks remain independent: public research may establish documented product behavior, never this customer's private implementation or completed demonstration.

Shared knowledge uses public publication IDs and sanitized metadata only. Keep private lineage entirely server restricted, and evaluate its current original eligibility, including contributor authority. A partner assigned A can cite an eligible publication derived from B without any B name, URL, original ID or count. Withhold content synchronously on any invalid critical dependency with cleanup stopped.

Accepted execution references are exact accepted, delivery-visible records belonging to the assignment's customer/engagement; they must pass 008's original-source/baseline checks. Time/economics/personnel/advisory content is not a valid 013 source. No pending checkpoint assertion is accepted by having mcteer click verify; require separate accepted evidence of the demonstration. Existing context/execution review is the route for accepting new evidence.

## Commands and review

Commands: `guide.create`, `guide.revise`, `guide.submit`, `guide.publish`, `guide.reject`, `guide.retire`, `assignment.create`, `assignment.withdraw`, `assignment.replace`, `checkpoint.save`, `checkpoint.submit`, `checkpoint.verify`, `checkpoint.request_changes`.

Publish/reject/retire, assignment create/withdraw/replace and checkpoint verify/request_changes require C07 exact previews. Preview binds action, target and any replacement/input digest, expected versions, current actor/target authority, guide/baseline and source closure. Save/submit uses optimistic concurrency without a review preview. Creation uses expectedVersion=0; all later operations compare the aggregate version. Assignment operations version their assignment; checkpoint saves/submits/decisions compare and increment the parent assignment version, serializing conflicting checkpoint progress. Guide changes compare/increment the guide version. A stale attempt ID or content digest fails even if another checkpoint incremented the same parent version.

Only the latest submitted guide head is reviewable. Only the one undecided submitted checkpoint attempt is reviewable. Editing invalidates outstanding previews. Rejecting/requesting changes may record evidence problems without requiring the evidence to be publishable, but cannot release ineligible prose. Retirement and withdrawal use metadata-only previews when content is withheld. Success returns a minimal receipt and a subsequent read loads current content.

Admission, status and explicit resolve acquire the same actor/request transaction advisory lock. Contention reports pending. Resolve-if-absent writes a permanent abandoned tombstone under that lock, fencing a late original command before the browser admits a different request. Same request identity/body returns the original minimal currently authorized outcome. Different input conflicts. Revocation overrides replay. A response lost before/after commit is reconciled by request ID; an unknown outcome never authorizes a different request. Retired receipts return terminal `retired` without repeating the action. Transaction timeout rolls back; connection loss returns uncertain client state until status is checked.

## Current progress and history

C12 uses required checkpoints of the exact current published-guide assignment. Verify requires currently verified prerequisites and supporting accepted evidence. All required checkpoints verified means learning complete, not delivery accepted. Optional attempts show their own states. Unreviewed draft, awaiting review, changes requested, blocked, verified and evidence unavailable are separate display states. Blockers are self-reported; they never override verification criteria.

Read history returns eligible author/rationale/body only after current checks. When withheld, return minimal identity, version, decision type and safe availability reason without old title, source names or stale completion percentage. Another partner's assignment/attempt is hidden, even for the same guide/customer. A regrant or revised guide requires mcteer to replace the assignment; no automatic transfer.
