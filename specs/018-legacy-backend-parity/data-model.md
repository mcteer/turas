# Data model

Existing canonical customer/source revisions remain factual authority. Public-learning snapshots retain original selected passages, title, URL, account, source type, publication/check/freshness dates and fetch key; projection must not substitute full documents. Source library returns newest eligible snapshot per fetch key with bounded cursor and original metadata.

Existing profile records/revisions/decisions carry structured journey payloads and exact source lineage. Review queue is a projection, not a second approval state. Draft/revised/rejected/retracted/accepted states retain history and exact request digests.

Existing engagements, reviewed baselines, time, allocations, capacity and finance permissions supply ordinary operations. Hypotheticals do not persist baselines. Intervention receipt binds actor, workspace, engagement, proposal revision, explicit decision, immutable request digest and replay outcome. Add explicit migration only if existing receipts cannot represent this mechanism.

Native files require owner/conversation-bound immutable staged bytes, size/digest/type, expiry and terminal cleanup; no browser-supplied path authority. Preferences remain principal scoped. Conversation ordinary-live classification must match read/search across relogin without relaxing governed snapshot fences.

Audit inventory binds each pinned legacy path/hash to its mechanism, current consumers, disposition, tasks and actual validation evidence. Authored inventory contains no customer values or credentials.

## Confirmed native retirement recovery

`ordinary_native_retirements` records one exact immutable owner/workspace/environment/conversation/native binding. State is requested until Eve returns a terminal reset/no-active-session receipt, then confirmed. Requested intent closes further ordinary admission. Retry metadata and minimal safe failure codes support maintenance recovery without saved user credentials. Confirmation, terminal response admission, and byte-purge eligibility commit together; unconfirmed bound bytes remain available only under current owner/content authorization. Explicit migration076 and restricted runtime grants release this mechanism.

## Ordinary decisions and consumed operations

Migration073 adds immutable `ordinary_intervention_authorizations` and `ordinary_intervention_decisions`. The framework's exact authenticated human response records authorization for one proposed call; the original executor consumes that exact proof. Mutation grants do not permit later rewriting the decision. Migration075 adds immutable `ordinary_operations_read_dependencies`; changed source or finance authority withholds stale conversation content while exact owner Stop/reset remains available. Migration074 stores owner-bound staged upload metadata and512KiB immutable chunks with10MiB per-file and100MiB owner bounds.

## Exact native question continuation

Migration077 adds immutable `ordinary_question_posts` and `ordinary_question_continuations`. A real owner POST pins the actual native question request event/window to the submitting login and membership before forwarding. The actual public model callback can arrive before native resolution/turn events and lacks native event metadata. Its application receipt binds that exact posted window to the actual callback turn/sequence; it never fabricates a framework event. A batch binds once, retries cannot extend the original deadline, competing login submission conflicts, and later provider admission rechecks the exact stored submitting login even if another login remains active. Runtime grants permit SELECT/INSERT only. Pre077 code/schema compatibility remains explicitly guarded.
