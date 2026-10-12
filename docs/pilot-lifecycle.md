# Pilot content lifecycle inventory

Existing domain policy is authoritative. The pilot runner calls the same governed
cleanup functions as workers; it cannot extend a deadline, bypass withdrawal or
remove permanent replay authority. Accepted profiles, plans and delivery history
have no new blanket TTL. Archive is a conversation visibility action, not deletion.

| Content and stores | Immediate authority and withholding | Governing expiry and finite execution |
| --- | --- | --- |
| Profiles and research originals in Postgres | Existing authorized profile review/retraction and source withdrawal; current eligibility is rechecked by downstream consumers | Accepted history retains its governing lifecycle. `lib/server/profiles/retractions.ts` retires projections and queues dependent cleanup; no global customer-delete operation is added |
| Artifact intents, originals, extracts, selections and native copies | `lib/server/artifacts/lifecycle.ts`; exact workspace/customer, version and generation; withdrawal denies reads before bytes disappear | `lib/server/artifacts/cleanup.ts`: original intent expiry, at most 20 expired intents, one exact cleanup claim per tick, bounded orphan reconciliation; native retirement uses the existing reset receipt |
| Workforce imports, originals, derived competencies and manual evidence | `lib/server/staffing/lifecycle.ts`; authorized manager and exact generation; retirement cancels dependent jobs and denies current use | Pending/cancelled/rejected payloads retain 30-day policy; accepted evidence remains until withdrawn; withdrawn purge within 24 hours with healthy worker. `lib/server/staffing/cleanup.ts` retains its tighter 20-source scan and one exact cleanup claim |
| Research raw bodies and retrieval passages/indexes/receipts | Original eligibility, approval, expiry and conflict fences in `lib/server/retrieval/`; a stale index completion cannot revive an original | Interrupted raw bodies at most 24 hours; retired derived payload within 60 seconds with healthy worker; operational receipts 30 days. `runRetrievalLifecycleTick` and `runRetrievalCleanupTick` preserve existing bounds; maintenance does not start paid embeddings |
| Shared knowledge and private lineage | `lib/server/knowledge/read.ts` rechecks lineage synchronously; publication withdrawal and original loss deny browser, search, citation, native and MCP use before purge | `suspendStaleKnowledge` sweeps at most 100 publications with a wraparound cursor, retires dependent projections and queues cleanup. Minimal publication/withdrawal and replay identities remain |
| Plan/design drafts, previews and accepted baselines | Current original and exact baseline/revision checks; `enqueuePlanCleanupForSource` records dependent cleanup | Accepted history has no blanket TTL; previews are valid for 10 minutes and removable after 24 hours; terminal drafting instructions retain 30-day policy. `lib/server/plans/cleanup.ts` preserves its 100-job bound |
| Execution payloads and native advice | Source/baseline/actor loss withholds current use before deletion | Ineligible payloads retain their 30-day policy; `lib/server/execution/maintenance.ts` and native retirement use at most 100 jobs per tick and existing exact reset receipts |
| Report revision payloads, calculations, private files, scratch and delivery metadata | `lib/server/reports/cleanup.ts` withholds expired revisions before purging; stream reads recheck current generation/eligibility | Existing report-retention-v2 policy and 730-day audit minimization remain distinct from file expiry. Unmatched signed receipts expire within 24 hours, with 1,000/environment admission and at most 100/batch. Each cleanup step retains its bound. Uncertain sends never become resend authority |
| Support payloads, advice, audit and native context | Governed owner/source eligibility; `lib/server/support/maintenance.ts` withholds invalidated content and retires consumed context | Invalidated at most 24 hours; obsolete drafts 90 days; assistant payload 30 days; audit 365 days with referential exceptions. Existing at-most-100 cleanup batches and lifetime keyed request fences remain |
| Expansion payloads, owner decisions, advice and native context | Assigned-owner and current-source checks; `lib/server/expansion/maintenance.ts` preserves decision and source distinctions | Invalidated at most 24 hours; obsolete drafts 90 days; advice 30 days; audit 365 days with referential exceptions. Existing at-most-100 cleanup bounds and lifetime request fences remain |
| Product gaps, impacts, previews, report/export bytes and handoff metadata | Governed mcteer review and current source eligibility; `lib/server/gaps/worker.ts` maintains exact causes | `lib/product-gaps/retention.ts`: invalidated 24 hours, obsolete 90 days, reports 30 days, receipts 365 days then keyed fence, previews 5 minutes. Report/gap storage classification stays explicit; report audit's 730 days does not replace gap policy |
| Partner guides, checkpoints, demonstrations and review payloads | Explicit assignment and current original/baseline checks; learning is distinct from certification and delivery acceptance | Invalidated at most 24 hours; obsolete/withdrawn 90 days; previews 5 minutes, cursors 15 minutes; audit 365 days; permanent request tombstones. `runPartnerMaintenanceTick` processes at most 100 entries and retries exact due jobs with bounded backoff |
| Adaptive learning feedback, evaluations, measurements, releases and native context | Current actor/original checks; synthetic pilot publication and measurement scopes remain isolated | Obsolete 90 days; invalidated at most 24 hours or an earlier source deadline using SQL LEAST; audit 365 days and lifetime tombstones. `runLearningMaintenanceTick` preserves its 100-operation/time bounds and reserves native-retirement capacity; native payload is gone only after an exact reset receipt |
| MCP connections, hashes, handles, leases, usage and management receipts | Current connection, session-equivalent identity, grant, workspace and source checks before/after retrieval; revocation denies reads immediately | Handles at most 15 minutes; usage at most 90 days; revoked/expired hashes purged within 24 hours; `runMcpMaintenanceTick` uses at most 100 per cleanup step. Minimal create/revoke replay identity remains permanent |
| Conversations, native workflows and uncertain external effects | Private owner, exact bound session, source dependencies and operational admission; watchdog reconciliation never blindly replays | No new conversation TTL. Exact retirement functions handle artifact/execution/support/expansion/learning context separately; unsupported managed-workflow recovery remains blocked rather than reconstructed |
| Operational samples | Only bounded typed observations; success requires an actual completed maintenance tick | Draft migration 057 enforces server-owned 90-day expiry. Independent sixty-second observation lane calls `turas_expire_health_samples(environment,100)`; control transitions, recovery verifications and replay fences are not sample data |
| New managed encrypted backups | Separately supplied owner/key/current-denial authority; active-store purge does not change a retained snapshot | Twelve-hour schedule, age at most 24 hours, seven-day expiry. Scheduling and physical expiry still require actual execution proof. Existing operator archives and independent current-denial/replay records are never auto-deleted by this rule |

The fifteen fixed maintenance lanes are bound in
`lib/server/operations/maintenance-bindings.ts` and scheduled independently by
`scripts/maintenance-worker.ts`. Their catalog batch limits are ceilings, not a
reason to widen a tighter existing domain step. Research freshness marks due
reviews without initiating research. Heavy extraction/render/import/embedding work
has separate admitted lanes and does not substitute for cleanup success.

Generation/lease/cause checks protect exact deletion. A missing object is handled
according to the owning domain's idempotent cleanup policy; ambiguous listing,
partial deletion or unavailable Blob is a failed/blocked physical outcome. It does
not make withdrawn content eligible. Retry uses existing domain job state and
backoff, never new actor privileges, reset deadlines or resurrected payloads.

Every outcome distinguishes active-store removal, retained minimal audit/replay
identity and backup expiry pending/completed. Restoration must reapply newer
withdrawals, revocations and permanent receipts before serving restored scopes.

`pilot-lifecycle.ts` records the explicit environment, actual finite class outcomes
and source/catalog digests. One execution or this inventory alone cannot prove the
full cross-feature expiry, Blob/interruption, native-retirement or backup catalog;
missing acceptance evidence continues to block readiness.
