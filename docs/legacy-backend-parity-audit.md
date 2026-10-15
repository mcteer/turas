# Legacy backend parity audit

Legacy source: `../turas-back` at `fd1e205d7fd258676d6fb12b3ade8a431d53a6af`. Current repair branch: `fix/profile-overview-placement`.

Status: in progress. This is a repair audit, not a new feature specification. Each mechanic requires a source comparison and behavior check before it is marked complete. The user requires legacy backend behavior, the current visual theme, automatic acceptance of independent research, and no fake showcased customers.

## Current hosted acceptance

- Baggu's exact product-use question passed independent semantic review on Preview `0ec65cf`, with minor wording and verbosity issues. Desktop/mobile WebKit and reloaded history passed. The answer distinguishes documented Vercel platform use from a historical framework stack.
- The Notion workflow on that Preview completed all three actual specialists and the original decision model. Its answer **failed** independent semantic review: material documented security-control and cancellation-overrun limitations were omitted. The review packet also lacked the actual typed evaluator output; a provider charge alone does not establish that the final interpretation faithfully reflects it. Research instructions now require these limitations to survive the handoff and final readout; hosted quality recheck remains open.
- Native questions survived a fresh login but failed to produce a retained answer on `0ec65cf`, `7b342b3` and `7882018`. Runtime logs identify an empty-turn input continuation before a resolution event. The context guard initially rejected it; `2311d59` then correctly blocked provider I/O because the attempt was still parked. These are failures, not acceptance evidence. Migration 067 and its adapter reserve one owner-posted window per actual native request, preserve the original injection and cumulative token allowance, and prevent retries from extending the window. Actual-model recheck remains required.
- An old owned test attempt had an admitted delivery but no native turn. Authenticated cancellation returned the actual runtime acknowledgment `no_active_turn`; that exact stopping attempt was reconciled as cancelled. No allowance was reset. The cancellation route now performs this reconciliation for ordinary chats only after the same native acknowledgment; accepted cancellation alone does not prove completion.
- Production remains unchanged. The shared evaluation ledger remains the original $15 budget. Full parity, final Preview inspection and cleanup are still incomplete.

The subsequent `77ec4be` Preview passed the actual native question flow: the pending question survived logout/login/reload, clicking Desktop returned exactly `Desktop`, desktop/mobile views had no overflow or active page errors, and the answer survived reload. An encrypted schema-66 capture (184 customers, 805 source revisions, no human profile records, 22 conversations and zero active attempts) was restored under matching PostgreSQL/vector versions and migrated to 67 with explicit grants before isolated Preview was migrated. The restore preserved these counts and removed its owned containers. Later provider-admission hardening carries that same posted deadline into the provider abort signal. Local checks reject provider I/O without both the posted window and original context injection.

The legacy conversation PATCH also supported owner-private title editing and optimistic archive/restore updates. The current build had omitted title editing and did not increment the archive revision. The repair restores an 80-character title edit and version checks, with existing ownership, workspace and current-grant checks. Older archive-only clients remain supported. Hosted interaction and visual checks remain required.

On Preview `2da3521`, headless CLI WebKit verified title editing, desktop/mobile layout and reloaded history against an existing owned conversation from `77ec4be`. Its exact `Desktop` answer remained visible on the newer deployment. No model call was dispatched. A single navigation-cancelled request occurred during reload; no active-page error or horizontal overflow occurred. This proves retained history on that deployment, not a subsequent model turn's runtime handoff.

The ordinary-chat correction repair uses Eve's native `turnPolicy: "steer"`; governed channels retain their queued policy. Migration 068 binds each correction to its owner's active attempt and original deadline, records the actual native delivery receipt, and prevents unknown outcomes from being resent. Only native-consumed corrections can supply human-claim quotations or replace the exact research question. Late completion of the initial turn cannot strand an admitted correction. Provider reservations preserve the existing 20,000-output-token conversation limit before I/O; interruption or missing usage retains the full reservation. Six disposable runtime-role checks cover same/new native turn projection, receipt replay and uncertain outcomes, a raced rejection, interrupted usage, concurrent reservations and cancellation. Type checking, 514 unit tests and the Eve build pass locally. Hosted steering acceptance remains open; these fixtures do not establish runtime behavior on Preview.

Preview `64cdedc` passed headless CLI WebKit title editing and reloaded native-question history at desktop/mobile sizes in both themes. Two fetch errors occurred during navigation reload, including one recorded cancelled request; no active-page errors or overflow occurred. The actual native correction/provider path was not dispatched by this check. Both application builds pass. Migration 068 was applied only after an encrypted schema-67 recovery capture and matching-version restore/migration rehearsal preserved 184 customers, 805 source revisions, zero human profile records and 23 conversations, with no active responses. Its temporary containers were removed.

Authenticated browser-form login passed on that immutable Preview URL and its branch alias. A read-only profile check found the same 184 real-customer directory as Production, overview placement above workload controls, product buttons and source details for 1Password and Notion. 1Password's checked research matches Production. Notion has 18 current sources versus Production's ten: eight baseline revisions remain current, two baseline revisions are retained with checked same-source successors, and new research accounts for the additional current evidence. Canonical baseline rows and their original dates/claims remain preserved. The original strict whole-profile digest comparison failed on these intended research updates; the subsequent read-only lineage check explains the difference and is not a claim that Preview and Production evidence are identical. This visual check did not dispatch paid evidence search. Read-only database checks found no synthetic, Cedar or Jupiter customer references in either environment.

The existing Notion native stream also yielded the actual typed decision output and all three specialist completion payloads without another model call. Independent review of this supplemented packet passed the final answer's decision readout: all eight judgments were unknown, further research was recommended and review remained required. Overall semantic acceptance still **fails** because the answer omitted material egress/brokering and timeout-overrun limitations. No new answer or overall hosted quality pass is inferred from recovering that evidence.

## Confirmed regressions

- General chat removes customer resolution, evidence reads, and research capabilities. Legacy resolves named customers inside the conversation and uses the canonical account without requiring a UI selection.
- Research now requires a separate user-started preview and identity-confirmation UI. Legacy admits the requested work, reuses eligible evidence, reserves duplicate work, delegates specialists, and joins running research durably.
- Chat renders assistant text as plain paragraphs with `white-space: pre-wrap`, rather than legacy structured Markdown, inline citations, and progressive activity.
- Current successful short-response smoke tests established transport only. They did not establish legacy customer research behavior.

## Audit ledger

| Mechanism | Legacy implementation | Current equivalent | Status |
| --- | --- | --- | --- |
| Identity, session and role authorization | lib/auth/ | lib/server/auth/ | Compared eight-hour private sessions, active revocation, scoped credentials and safe return paths. Current database-backed membership/grants and CSRF remain required; legacy in-memory fallback and request-time schema initialization are deliberately excluded by current governance. Authenticated Preview form login and owner isolation checked. |
| Private chat ownership and durable binding | lib/conversations/; agent/hooks/conversation-owner.ts | lib/server/conversations/ | Compared owner/workspace/environment isolation, search, title length, archive/restore versions and native binding. Current durable operation keys replace legacy overwrite binding; title/archive parity restored. Hosted reload/title checks pass; late-turn association/Stop regression passes locally; final hosted check open. |
| Canonical name, aliases and documented workload resolution | agent/tools/resolve_customer_account.ts; lib/customer-evidence/repository.ts | Named resolver and governed reads restored locally | Local unit/integration checks pass; hosted verification pending |
| Customer evidence and longitudinal journey | agent/tools/get_customer_evidence.ts; get_customer_journey.ts; lib/customer-journey/ | lib/server/profiles/ | Compared source-backed public inventory, dated account evidence and approved journey chronology. Canonical reads preserve original source/check dates, labels and unknowns; hybrid journey fallback restored. Dated inventory backfill and local authorization checks pass; final hosted inventory tool check open. |
| Human claim capture, review, revision and retraction | capture_customer_context.ts; app/api/context-approvals/ | lib/server/profiles/; lib/server/artifacts/ | Compared draft creation, approval/rejection, versioned revision/retraction and human-source provenance. Current steward commands preserve review only for human claims. Independent research bypasses human review through its checked-source writer. Unselected-chat attachment intake remains a documented gap. |
| Research admission, reuse, leases and duplicate suppression | agent/tools/prepare_customer_research.ts; lib/research-cache/requests.ts | lib/server/research/requests.ts | Legacy admission/reuse/join tools restored; automatic ordinary-chat routing restored; hosted checks pending |
| Recon, practices and implementation specialists | agent/subagents/; agent/lib/research-context-tool.ts | Omitted; specialist contracts/cache/provider implementation now ported under lib/server/research/specialists/ | Compared authored contracts, three workers and typed workflow handoffs. All three actual specialists completed on Preview; final answer quality and explicit reuse acceptance remain open |
| Durable joining, background activity and cancellation | wait_for_customer_research.ts; lib/chat-messages.ts; task_cancel.ts | Research polling/native attempts | Durable join and owned task cancellation restored; original background work is not restarted for polling. Actual specialist completion and native questions observed. Local real-Eve/headless correction/reload, Stop settlement and owner retirement pass with a deterministic provider; hosted steering check remains open. |
| Provider discovery and rendered source readers | lib/solution-research/{independent-search,provider}.ts; lib/research-cache/fetch.ts | lib/server/research/ | Compared original Context/Exa discovery, bounded rendered fetch, publication metadata and checked-page receipts. Actual Preview discovery/source retention observed; all-source/provider failure coverage remains bounded, not exhaustive |
| Source integrity, focused passages and attribution | lib/solution-research/{source-integrity,source-focus,attribution}.ts | lib/server/research/ | Compared exact passages, publication provenance, source focus and community attribution. Twelve solution-research modules are unchanged apart from import paths; typed integrity/reuse checks pass. Latest final answer caveat preservation still needs hosted recheck |
| Publication/event chronology and freshness | release-chronology.ts; freshness*.ts | lib/server/research/; profiles/quality.ts | Original chronology and five information-type windows (7/14/30/90/180 days) compared. Specialist classification now reaches canonical quality/freshness instead of forcing adoption_process. Ten owned Preview sources corrected without provider calls; original dates and quotations verified, including recovery of five displaced quotations. |
| Checked knowledge persistence and customer updates | customer-update*.ts; lib/research-cache/public-learning.ts | public-persistence.ts; specialists/retain-profile.ts | Local assigned-partner persistence, recheck, late-document indexing and revocation checks pass |
| Hybrid retrieval, embeddings and index invalidation | lib/customer-journey/{memory,embeddings,search-store}.ts | lib/server/retrieval/ | Compared original authorized hybrid/keyword search, recent fallback and current-source invalidation. Canonical retrieval remains the shared domain. Journey now selects matched approved records, dates/orders recent records and preserves offset/stale/delta fields; local tests pass. The record search now preserves legacy’s 200-candidate pools, 0.75 semantic cutoff, RRF-60 and 21-ID lookahead for 20-record pages. Keyword retrieval reads approved records immediately, even while their asynchronous index is pending; a 20+5-record/draft-exclusion/access-denial regression passes. |
| Signed research artifacts, handoffs and solution decisions | agent/lib/research-handoff.ts; lib/solution-research/{artifacts,receipt,decision-workflow}.ts | lib/server/research/; lib/server/plans/ | Compared signed retained artifacts, server-bound handoffs, canonical context/source versions, expiry and the original eight-prerequisite decision workflow. JSONB-stable signing and current-access fences replace legacy identity/storage assumptions. Actual evaluator readout passed independent review; final Notion answer quality failed and remains open. |
| Reusable solutions and customer-specific applications | lib/solution-patterns/; get_solution_knowledge.ts | lib/server/knowledge/workspace-patterns/ | Complete legacy fields and six-dimensional target fit restored; current source withdrawal invalidates reuse locally |
| Customer learning and consent | lib/customer-learning/; get_adoption_patterns.ts | lib/server/learning/customer-adoption/ | Original metric, contribution consent/versioning and cohort suppression restored; local checks pass |
| Capacity, interventions, scenarios and services arithmetic | lib/demo/{metrics,services-plan,repository}.ts | lib/server/{staffing,execution,finance}/ | Compared original services-plan arithmetic (copied) and five fixed-date demo-only portfolio/scenario/intervention tools. Real governed staffing/execution/finance retain their own source/approval rules. Fictional records excluded; ordinary access to the real counterparts remains an explicit routing gap |
| Attachments, text extraction and context submission | lib/attachment-extract.ts; lib/chat-attachments.ts; intake route | packages/artifact-extractor/; lib/server/artifacts/ | Legacy text/JSON/YAML/XML/log/HTML/RTF/EPUB/ODF formats restored alongside existing Office/PDF/image paths with explicit extraction locators. Twelve real Linux parser formats and provenance/security checks pass. Unselected-chat attachments and hosted parser execution remain open; local Docker does not prove Preview Sandbox behavior. |
| Connections, registry discovery and generic runtime tools | agent/connections/; connection_search.ts; built-in tool exports | agent/connections/; installed eve tools | Compared the original connector-discovery guard and three environment-disabled existing-grant-only Linear/Notion/Vercel declarations. The guard is preserved. docs/legacy-review.md classifies these as unused/demo integration history; no approved operational source was identified, so credentials or speculative connectors were not installed |
| Model/context assembly, memory, skills and tool availability | agent/agent.ts; instructions.md; agent/memory/; agent/skills/ | agent/ | Compared selected model, dynamic context, file preference memory, disabled filesystem/root-copy tools, skills and scoped tool catalogs. Full legacy ordinary guidance is now scoped to normal turns; bounded governed workflows keep the original input limits. All 16 unpaid real-runtime learning arms pass, as do native ordinary correction/history/Stop checks. Hosted preference persistence and skill-load acceptance remain open |
| API routes and maintenance/recovery entry points | app/api/; agent/channels/ | app/api/; agent/channels/; operations/ | Compared original auth/conversation/binding, customer source/journey, context approvals and maintenance entry points. Current canonical ownership, CSRF, source review and durable binding remain server-enforced. Daily bounded public maintenance is wired; authenticated Preview reads and owner retirement pass. Positive hosted maintenance and application payload cleanup remain open. |
| Chat projection, Markdown, citations and progress | app/_components/{agent-chat,agent-message}.tsx; lib/chat-messages.ts | app/_components/agent-chat.tsx | Structured Markdown and native activity restored; actual Preview desktop/mobile/reload inspected. Latest actual research answer failed semantic review; steering remains open. |

## Complete legacy tool inventory

Every entry below must be accounted for by the domain ledger; naming similarity is not behavior proof.

| Legacy tool | Comparison |
| --- | --- |
| `agent` | Both builds disable generic root-copy delegation. Declared legacy specialists are separate capabilities. |
| `ask_question` | Native question tool and owner/CSRF-checked response route restored. Actual fresh-login, Desktop response and reloaded history passed on `77ec4be`; final-commit verification remains open. |
| `bash` | Both builds disable model-facing shell access. |
| `calculate_engagement_scenario` | Legacy tool reads only `lib/demo/repository` and calculates a nonpersistent synthetic what-if for `eng-*` IDs. Its fake portfolio is excluded under the request to use real customers. Current governed finance/staffing scenarios require canonical engagement authorization; ordinary-chat access to those real scenarios remains a gap. |
| `calculate_services_plan` | Original schema, explicit proposed defaults and arithmetic copied. Ported checks prove full annual payroll/overhead, pricing floor, losses, zero denominators and protected capacity. No portfolio records imported. |
| `capture_customer_context` | Compared original draft-only submission, structured journey/impact fields, conversation provenance and separate owner approval. Current canonical proposal writer preserves these fields, binds excerpts to actual user messages (including consumed corrections), and requires steward review for human claims. No automatic human-claim acceptance. Local checks pass; hosted capture acceptance open. |
| `connection_search` | Compared: original provider-discovery guard retained. Customer lookup routes to the canonical resolver; missing private data does not trigger connector installation. |
| `evaluate_solution_research` | Original signed artifact/handoff, eight typed prerequisites, fixed decision gates, process impact and freshness contracts ported. Current adapter adds live canonical grants/context digests and shared budget admission. Actual evaluator output was recovered and independently judged faithful as a decision; the final Notion answer still failed caveat preservation. Hosted quality recheck open. |
| `get_adoption_patterns` | Authored report contract ported; legacy owner maps to current internal administrator. Original metric inputs, consent, quarter/version semantics and minimum five-account cohort suppression are covered locally. Hosted acceptance open. |
| `get_capacity` | Legacy returns fixed synthetic demo capacity. Current `read_staffing_capacity` uses governed real staffing inputs; legacy ordinary-chat capacity routing remains a gap. No demo figures imported. |
| `get_customer_evidence` | Governed named reads now retain original passages, product identity and separate source/check dates. Byte-limited pagination fixed. Hosted check pending. |
| `get_customer_journey` | Hybrid retrieval and explicit recent fallback restored locally. Current dependency/grant fences retained. Hosted check pending. |
| `get_customer_research_update` | Original exact signed recon read, source passages, discovery receipts, release chronology, freshness and coverage preserved. Current handoff adds canonical source eligibility, server-bound question and original dates; independent findings update profiles without human review. Baggu actual-model answer passed; final Notion caveat recheck open. |
| `get_engagement_brief` | Legacy reads a synthetic brief from `lib/demo/repository`. Current execution summaries and delivery-plan reads use authorized real engagements; ordinary-chat brief routing remains a gap. No fictional brief imported. |
| `get_learning_contribution` | Original account/quarter contribution read contract ported with current live administrator authorization and normal-chat availability. No automatic contribution consent. Hosted acceptance open. |
| `get_portfolio_summary` | Legacy returns fixed-date synthetic portfolio exceptions from `lib/demo/repository`. No production data behavior exists to copy verbatim; governed real portfolio reads need explicit ordinary-chat routing. Fake records excluded. |
| `get_public_customer_learning` | Original account-wide public passage read contract ported, with canonical source/dependency and current-access fences. Original dates, contrary evidence and refresh flags retained; cross-account examples remain public-only. Hosted reuse acceptance open. |
| `get_solution_knowledge` | Original account applications/context-hash/invalidation read contract ported to canonical approved records. Private publication lineage remains steward-restricted; no automatic publication. Local source-withdrawal checks pass; hosted acceptance open. |
| `list_customer_evidence` | Original name/alias/workload/product search and five qualitative signal filters restored on authorized canonical IDs. Explicit dated-reference backfill binds existing checked source revisions; no new customer, grade or accepted human claim. New checked research participates in product lookup. Unknown inventory fields remain null. Local grant, withdrawal, pagination, source-preserving successor and idempotence checks pass; hosted acceptance open. |
| `load_skill` | Ordinary chat delegates to installed Eve native `load_skill` as legacy does. Existing governed workflows retain their authorized domain adapters. Generic root filesystem tools remain unavailable; hosted ordinary skill-load acceptance open. |
| `prepare_customer_research` | Compared original reservation/reuse/working/needs-recon states, exact user question, explicit refresh and recon-before-solution gate. Current context hashes add source generations and canonical grants; parent/child lineage supplies reservations without model-generated lease IDs. Three specialists ran on Preview; explicit hosted reuse acceptance remains open. |
| `read_file` | Both builds disable arbitrary filesystem reads. |
| `record_engagement_intervention` | Legacy can mutate only the literal fictional `eng-notion-pilot`, with exact-version/idempotency checks and human approval. Current execution/staffing decisions preserve real authorization and approval; ordinary-chat routing is not yet equivalent. Fictional mutation not installed. |
| `resolve_customer_account` | Exact name/alias priority, documented workloads and ambiguity ported to current canonical UUIDs; grants checked before lookup. Local tests pass. |
| `review_learning_contribution` | Original explicit contribution approval command ported with live internal-admin/account review authorization, exact versions and idempotency. Consent is separate from research acceptance. Local checks pass; hosted approval acceptance open. |
| `review_solution_application` | Original separately approved target adaptation retained, including all six fit dimensions, validation plan, context hash and version/idempotency checks. Current account-steward policy replaces demo owner identity; hosted approval acceptance open. |
| `review_solution_pattern` | Original separately approved generalized derivative publication/withdrawal retained, with source-steward review, redaction/outcome attestation and exact source/version lineage. Local withdrawal/invalidation checks pass; hosted approval acceptance open. |
| `search_solution_patterns` | Original same-workspace eligible-derivative search and target-context hash contract ported. Similarity grants neither target approval nor source-record access. Local six-dimensional fit/source invalidation checks pass; hosted acceptance open. |
| `task_cancel` | Static native tool restored with owned background-task admission; authenticated Preview cancellation returned 202 and left zero live research leases. |
| `todo` | Removed by the installed Eve framework. Its changelog explicitly requires removing `agent/tools/todo.ts`; `eve/tools/todo` returns `ERR_PACKAGE_PATH_NOT_EXPORTED`. No fictional replacement or unsupported export added. |
| `wait_for_customer_research` | Original durable background join retained: 60 checks separated by ten-second workflow sleeps, no model polling or automatic restart after ten minutes. Current adapter adds parent-session authority and account access before reading progress. Hosted specialist completion observed; separate duplicate-join acceptance open. |
| `web_fetch` | Both disable the generic tool; legacy uses the bounded specialist source reader. |
| `web_search` | Both disable the generic tool; legacy uses governed specialist discovery. |
| `write_file` | Both builds disable arbitrary filesystem writes. |

## Repair verification so far

- Seven local customer-resolution, pagination and Markdown/message-projection tests pass.
- Five copied specialist contract tests pass: publication provenance, freshness, remaining-passage navigation, reuse scope/context keys and rejection of invented passage IDs.
- Explicit migrations 056–058 initialize successfully in an owned disposable pgvector/Postgres 18 database, including runtime grants.
- Six disposable integration/contract checks pass: named lookup and authorization revocation, general chat ownership, send deduplication, lazy-query atomic rollback, and concurrent evaluation-budget admission before provider invocation.
- Eve and Next.js builds pass. Local CLI WebKit rendering was inspected; this is not hosted Preview verification.
- Paid hosted checks are now in progress under the shared $15 authorization. No Production change or merge has occurred for this repair.
- Remaining major work includes actual specialist runtime admission/background lifecycle, profile persistence on all authorized research paths, native questions/approvals/steering, thread refresh/reuse, the remaining domain/tool comparisons, and authenticated hosted Preview checks.

## Hosted findings and subsequent repairs

Actual Preview recon ran under the non-administrator `panel` identity, without a
customer picker. It retained four independently checked public source documents
and produced 66 ready full-document vector passages. This proves that path's
canonical writes, not the quality of its answer or all specialist paths.

Independent LLM review of the actual reply failed: the answer dismissed useful
framework evidence because hosting was unknown, included irrelevant retail
material, and ended with an unfulfilled promise to read a completed result.
Root instructions now require the focused sourced answer and loading the bound
result before completion. Hosted re-evaluation remains required.

Subsequent meaningful disposable runtime-role checks cover:

- Worker-private evidence reads preserve the parent model's consumed-source fence
  until the parent actually receives refreshed knowledge.
- Rephrased admissions share an active reservation; the original submitted user
  question now supplies the bounded reuse question rather than model wording.
- Finalized source references select the retained quotations. New findings augment
  earlier still-verbatim quotations; full-document navigation does not establish
  product adoption. Coverage continuity checks remain bound to the same canonical
  source and retained supporting quotes.
- Canonical source withdrawal blocks cache reuse and source reads; material
  conflicts use the existing canonical retrieval conflict check. New independently
  discovered URLs remain researchable.

Read-only CLI WebKit inspection on `a533a25` preserved history at desktop and mobile
sizes with no horizontal overflow. WebKit reported one long-lived fetch cancelled
specifically during document reload; request-failure instrumentation confirmed
`cancelled` during navigation. This is recorded separately, not reported as zero
browser errors. No additional model call was made by that inspection.

All hosted checks share the original $15 ledger. At the last ledger read,
$1.131615 was metered model/embedding usage and $0.158 remained conservatively
accounted as provider fee holds. No allowance was reset. Production remains
unchanged. Three-specialist/decision/reuse acceptance, native steering, remaining
attachment formats, maintenance wiring, the remaining inventory comparisons,
final exact-commit hosted inspection and cleanup are still open.

### Additional actual Preview checks

On `f5afe7b`, the exact question “What Vercel products is Baggu using?” completed
through actual recon after server-bound delegation supplied the canonical account
ID. Desktop/mobile/reload transport checks passed; the separate semantic judgment
remains required. The prior `fcd2c9e` run exposed the omitted-ID handoff and is a
failed check, not acceptance evidence.

A concurrent Notion workflow failed with PostgreSQL `40P01` before its specialist
handoffs. Read-scope authorization upgraded shared membership locks to exclusive
locks, allowing two ordinary chats to deadlock. That validation now retains shared
locks; a disposable two-connection barrier test reproduces the lock sequence and
passes. The failed Notion cohort was cancelled through its owned authenticated
endpoint (202), and its hosted recheck remains open.

The browser harness was also corrected to wait for an enabled empty composer,
not an enabled Send button (which correctly stays disabled with no draft).
Harness mistakes and actual product failures remain separately recorded.

On `0ec65cf`, the original Baggu question passes independent LLM semantic review
with minor wording/verbosity issues; desktop/mobile/reloaded history also pass.
A separate Notion question completed all three actual specialists and the original
Luna decision model. Typed recon, practices and solution receipts are stored;
transport and visual history checks pass. Its substantive solution review and
explicit reuse check remain open. Total accounted usage at this checkpoint is
$4.388535 including full provider fee holds, within the unchanged $15 ledger.

The native question survived sign-out/new-login and accepted its answer, but its
resumed reply failed. Input resolution is now associated through actual native
request IDs and its resume window can bind a different native turn. The local
regression uses a different resumed turn, preserves original receipts and the
conversation token allowance, and passes. Hosted re-evaluation is still required.

### Fixed-date demo tools

The five legacy capacity/portfolio/brief/scenario/intervention tools directly read
`lib/demo/repository.ts`; their schemas and descriptions explicitly identify
synthetic data. The intervention accepts only the literal fictional
`eng-notion-pilot`. Copying those records would contradict removal of showcased
fake data. Their domain concepts map to current staffing capacity, dated finance
scenarios and tracked execution/decision APIs. Ordinary-chat access to those real
domains is not yet equivalent: several reads remain bound to governed explanation
sessions. This is an open routing gap, not a claim of parity from similar names.

## Source inventory

Inventory contains 164 authored backend/agent/API files. Listing a file does not mean it has been reviewed. Customer snapshots, credentials, vendored dependencies and generated artifacts are excluded from this source inventory.

<details>
<summary>Paths</summary>

- `lib/attachment-extract.ts`
- `lib/auth/authorize.ts`
- `lib/auth/diagnostics.ts`
- `lib/auth/next.ts`
- `lib/auth/session.ts`
- `lib/chat-attachments.ts`
- `lib/chat-messages.ts`
- `lib/conversations/repository.ts`
- `lib/customer-evidence/products.ts`
- `lib/customer-evidence/repository.ts`
- `lib/customer-journey/account.ts`
- `lib/customer-journey/embeddings.ts`
- `lib/customer-journey/identity.ts`
- `lib/customer-journey/memory.ts`
- `lib/customer-journey/repository.ts`
- `lib/customer-journey/schema.ts`
- `lib/customer-journey/search-store.ts`
- `lib/customer-learning/repository.ts`
- `lib/customer-learning/schema.ts`
- `lib/db/client.ts`
- `lib/decisions/repository.ts`
- `lib/demo/fixtures.ts`
- `lib/demo/metrics.ts`
- `lib/demo/repository.ts`
- `lib/demo/services-plan.ts`
- `lib/demo/types.ts`
- `lib/research-cache/database.ts`
- `lib/research-cache/fetch.ts`
- `lib/research-cache/library.ts`
- `lib/research-cache/maintenance.ts`
- `lib/research-cache/passage-view.ts`
- `lib/research-cache/practice-library.ts`
- `lib/research-cache/public-learning.ts`
- `lib/research-cache/requests.ts`
- `lib/research-cache/schema.ts`
- `lib/research-cache/sources.ts`
- `lib/solution-patterns/database.ts`
- `lib/solution-patterns/repository.ts`
- `lib/solution-patterns/schema.ts`
- `lib/solution-patterns/version.ts`
- `lib/solution-research/artifacts.ts`
- `lib/solution-research/attribution.ts`
- `lib/solution-research/citations.ts`
- `lib/solution-research/context.ts`
- `lib/solution-research/customer-update-receipt.ts`
- `lib/solution-research/customer-update.ts`
- `lib/solution-research/decision-workflow.ts`
- `lib/solution-research/decision.ts`
- `lib/solution-research/discovery.ts`
- `lib/solution-research/evaluation-config.ts`
- `lib/solution-research/evidence.ts`
- `lib/solution-research/freshness-report.ts`
- `lib/solution-research/freshness.ts`
- `lib/solution-research/independent-search.ts`
- `lib/solution-research/process-impact.ts`
- `lib/solution-research/provider.ts`
- `lib/solution-research/receipt.ts`
- `lib/solution-research/release-chronology.ts`
- `lib/solution-research/schema.ts`
- `lib/solution-research/source-focus.ts`
- `lib/solution-research/source-integrity.ts`
- `lib/solution-research/submission.ts`
- `lib/utils.ts`
- `agent/agent.ts`
- `agent/channels/eve.ts`
- `agent/connections/linear.ts`
- `agent/connections/notion.ts`
- `agent/connections/vercel.ts`
- `agent/hooks/conversation-owner.ts`
- `agent/instructions.md`
- `agent/lib/existing-grant-auth.ts`
- `agent/lib/practice-context-tool.ts`
- `agent/lib/public-research.ts`
- `agent/lib/research-context-tool.ts`
- `agent/lib/research-handoff.ts`
- `agent/lib/research-state.ts`
- `agent/lib/research-tools/read_public_research_source.ts`
- `agent/lib/research-tools/read_research_passages.ts`
- `agent/lib/research-tools/research_evidence.ts`
- `agent/lib/research-tools/search_public_research.ts`
- `agent/memory/file.ts`
- `agent/skills/customer-learning/SKILL.md`
- `agent/skills/customer-maturity-journey/SKILL.md`
- `agent/skills/customer-posture/SKILL.md`
- `agent/skills/delivery-methodology/SKILL.md`
- `agent/skills/engagement-health-and-risk/SKILL.md`
- `agent/skills/services-business-review/SKILL.md`
- `agent/skills/solution-research/SKILL.md`
- `agent/subagents/customer-recon/agent.ts`
- `agent/subagents/customer-recon/instructions.md`
- `agent/subagents/customer-recon/tools/bash.ts`
- `agent/subagents/customer-recon/tools/connection_search.ts`
- `agent/subagents/customer-recon/tools/finalize_customer_update.ts`
- `agent/subagents/customer-recon/tools/get_research_context.ts`
- `agent/subagents/customer-recon/tools/read_file.ts`
- `agent/subagents/customer-recon/tools/read_public_research_source.ts`
- `agent/subagents/customer-recon/tools/read_research_passages.ts`
- `agent/subagents/customer-recon/tools/research_evidence.ts`
- `agent/subagents/customer-recon/tools/search_public_research.ts`
- `agent/subagents/customer-recon/tools/web_fetch.ts`
- `agent/subagents/customer-recon/tools/web_search.ts`
- `agent/subagents/customer-recon/tools/write_file.ts`
- `agent/subagents/implementation-research/agent.ts`
- `agent/subagents/implementation-research/instructions.md`
- `agent/subagents/implementation-research/tools/finalize_research.ts`
- `agent/subagents/implementation-research/tools/get_practice_context.ts`
- `agent/subagents/implementation-research/tools/get_research_context.ts`
- `agent/subagents/implementation-research/tools/read_public_research_source.ts`
- `agent/subagents/implementation-research/tools/read_research_passages.ts`
- `agent/subagents/implementation-research/tools/research_evidence.ts`
- `agent/subagents/implementation-research/tools/search_public_research.ts`
- `agent/subagents/vercel-best-practices/agent.ts`
- `agent/subagents/vercel-best-practices/instructions.md`
- `agent/subagents/vercel-best-practices/tools/finalize_vercel_practices.ts`
- `agent/subagents/vercel-best-practices/tools/get_practice_context.ts`
- `agent/subagents/vercel-best-practices/tools/read_public_research_source.ts`
- `agent/subagents/vercel-best-practices/tools/read_research_passages.ts`
- `agent/subagents/vercel-best-practices/tools/research_evidence.ts`
- `agent/subagents/vercel-best-practices/tools/search_public_research.ts`
- `agent/tools/agent.ts`
- `agent/tools/ask_question.ts`
- `agent/tools/bash.ts`
- `agent/tools/calculate_engagement_scenario.ts`
- `agent/tools/calculate_services_plan.ts`
- `agent/tools/capture_customer_context.ts`
- `agent/tools/connection_search.ts`
- `agent/tools/evaluate_solution_research.ts`
- `agent/tools/get_adoption_patterns.ts`
- `agent/tools/get_capacity.ts`
- `agent/tools/get_customer_evidence.ts`
- `agent/tools/get_customer_journey.ts`
- `agent/tools/get_customer_research_update.ts`
- `agent/tools/get_engagement_brief.ts`
- `agent/tools/get_learning_contribution.ts`
- `agent/tools/get_portfolio_summary.ts`
- `agent/tools/get_public_customer_learning.ts`
- `agent/tools/get_solution_knowledge.ts`
- `agent/tools/list_customer_evidence.ts`
- `agent/tools/load_skill.ts`
- `agent/tools/prepare_customer_research.ts`
- `agent/tools/read_file.ts`
- `agent/tools/record_engagement_intervention.ts`
- `agent/tools/resolve_customer_account.ts`
- `agent/tools/review_learning_contribution.ts`
- `agent/tools/review_solution_application.ts`
- `agent/tools/review_solution_pattern.ts`
- `agent/tools/search_solution_patterns.ts`
- `agent/tools/task_cancel.ts`
- `agent/tools/todo.ts`
- `agent/tools/wait_for_customer_research.ts`
- `agent/tools/web_fetch.ts`
- `agent/tools/web_search.ts`
- `agent/tools/write_file.ts`
- `app/api/auth/login/route.ts`
- `app/api/auth/logout/route.ts`
- `app/api/auth/session/route.ts`
- `app/api/context-approvals/intake/route.ts`
- `app/api/context-approvals/route.ts`
- `app/api/conversations/[id]/route.ts`
- `app/api/conversations/bind/route.ts`
- `app/api/conversations/route.ts`
- `app/api/customers/[id]/journey/route.ts`
- `app/api/customers/[id]/sources/route.ts`
- `app/api/internal/research-maintenance/route.ts`

</details>

## Local implementation checkpoint — 2026-10-14

- Three legacy authored specialists retain their Terra model, reasoning, dollar/token limits, rendered Context reader, independent Exa discovery, quote checks, chronology, source focus and signed result contracts. The current Eve release requires structured output on invocation and top-level workflow functions; these are framework adapters, not replacement research loops.
- Independently checked source reads update canonical profiles for an authorized member or assigned partner. Full rendered documents are retained separately from curated quotations and materialized through the current retrieval queue. A new check preserves still-verbatim curated claims; publication/observation dates are not reset. Body changes invalidate brief reuse independently of private-context changes.
- Ordinary customer chat refreshes its initial profile context and permits named reads of other accessible customers. A fresh login can continue the thread and answer its actual pending question. Current access to every previously consumed customer remains required. Planning, staffing, execution, support, expansion and governed learning retain their distinct bindings and tool catalogs.
- Native input waits have a separate state and append-only resume window. Answering does not rewrite the original dispatch deadline or immutable identity receipt. Ordinary model calls, including resumed answers, retain the application's cumulative output allowance.
- Workspace solution derivatives retain the original publication/review fields, review expiry, source lineage, six fit dimensions and target-context hash. They are not relabelled as globally published product learnings. Measured customer adoption retains the original metric, same-population counts, 28–35-day measurement window, explicit contribution/revocation and minimum five accounts in each group.
- Legacy personal-preference file memory reuses an existing configured backend, scoped to environment/workspace/authenticated principal. No memory store or connector is provisioned. Recalled preferences do not become canonical customer facts.
- Local database checks run only in an owned disposable database and remove its container, volume, credentials and temporary directory afterward. They cover named reads, ownership, grant revocation, source retention, late-document passages, duplicate requests, background completion/cancellation, fresh-login continuation, native pending input, complete solution patterns, lineage invalidation, cohort suppression, transaction rollback and budget concurrency.
- An encrypted capture of the actual Preview schema 55 was restored locally and migrated through schema 66 with explicit runtime grants. The rehearsal preserved 184 customer references, 770 source revisions and three conversations; no active response or human profile record was changed. The rehearsed migrations and explicit grants were applied to isolated Preview schema 66. Production remains unchanged.

Still open before completion: authenticated hosted model/provider paths and reuse; actual profile/vector effects; desktop/mobile WebKit inspection; ordinary-chat steering; the full attachment-format comparison; scheduled research maintenance under current service authorization; hosted preference persistence; and final cleanup. The restored ordinary capabilities are not advertised as available in governed feature workflows.

## Required completion evidence

Record focused unit/integration tests, meaningful real-model questions, actual hosted source/knowledge effects, authenticated CLI Playwright/WebKit desktop/mobile inspection, and cleanup. Never substitute fixture responses for hosted acceptance. Unknown, untested or divergent mechanisms stay explicitly open.

### Current-knowledge continuation verification

Ordinary model admission now injects a fresh authorized customer brief before every provider call. Changed, withdrawn or expired retrieval dependencies are explicitly retired from active factual use through append-only refresh receipts; original retrieval receipts remain unchanged. History remains dated context. Every previously consumed customer still requires its current grant and original audience. A disposable integration check consumes a research source, replaces its actual checked content, refreshes the same thread, verifies the new passage and citation, preserves the original dependency row, and confirms its explicit retirement. Governed workflow fences remain strict. Source freshness is validated on model admission and newly projected assistant output; ordinary lifecycle events and dated replay use cumulative authorization. Hosted proof is still required.

### Hosted findings and follow-up — 2026-10-15 UTC

Authenticated CLI WebKit reached named Baggu lookup, canonical evidence, automatic research admission and the background recon tool with no customer selection. Initial hosted runs exposed serializable model-selection and immutable-source row-lock problems; both adapters were corrected. Specialist model selection also needs its parent resolved from the immutable owner-bound attempt because dynamic model callbacks do not expose a tool's parent accessor. The replacement retains exact parent/worker/kind reservation checks. Terminal specialist workflow failures release only that originating attempt's unfinished reservation so durable joiners stop promptly. These paths remain subject to hosted recheck.

The source-persistence and thread-refresh integration now runs all application operations as `turas_runtime`, with administrator access used only to create isolated fixture rows. Independently rediscovered URLs that previously appeared in a human submission require a signed server discovery association before their independently fetched source can be accepted; the original human submission remains pending/reviewed on its own path. Tests cover denial without that proof and acceptance with it. Standard human-form corrections preserve structured journey dates, impact and private provenance server-side while creating a new Pending revision. Owned research-cohort cancellation closes its admission before forwarding native cancellation, including after the initial reply completes.

Paid evaluation accounting is shared across these attempts and is never reset for a retry. Actual hosted acceptance is not yet complete; temporary conversations and artifacts still require removal after verification.

### Additional audited gaps — legacy formats, maintenance and inventory

Legacy accepted JSON, YAML/YML, XML/log text, HTML, RTF, EPUB and ODT/ODS/ODP/ODG. These formats now use the existing quarantined, scan-bound and network-isolated extractor. HTML/Office conversion uses the same pinned officeparser as legacy; text locators describe extracted lines rather than invented pages or cells. ZIP family checks, expansion limits, encryption/entity/executable-entry denial and explicit partial coverage remain enforced. Fourteen parser/provenance cases pass, and a separately built Linux image extracted all twelve added extensions under `--network none`. Its owned containers, image and dedicated builder/cache were removed. This does not establish hosted attachment execution. Unselected ordinary-chat attachments and the separate 016 hosted execution rollout remain open.

The original `17 3 * * *` daily research-maintenance entry point was absent. Its restored route requires the exact cron bearer and rejects browser-cookie authority. It performs the original environment-scoped retention cleanup, at most three index retries and two retained public-URL rechecks. It creates no human identity, root-model session, private connector read or canonical customer claim. Public maintenance checks active workspace/customer scope and current source withdrawal/conflicts before retrieval and before advancing confirmed passages. Removed passages retain their original dates. Disposable runtime-role checks cover these boundaries and environment isolation; positive hosted execution remains open.

The cache-to-profile adapter discarded every specialist `informationType` and wrote `adoption_process`. The repair now carries the existing typed classification through the source reader, retention request identity, canonical quality input and index refresh. Enum names are mapped explicitly between existing research/profile contracts; the legacy 7/14/30/90/180-day windows remain unchanged. A classification correction creates an immutable successor without rewriting the checked retrieval date. Local checks show product-capability documentation does not become a product-use indicator, while a documented architecture source retains its product indication. Dated curated inventory product labels remain source-backed, including on a checked successor that preserves every original quotation.

The inventory backfill imports only the legacy public reference's dated directory metadata and cited story classifications. It does not import snapshot customer records, create missing accounts, infer qualitative signals, or promote human claims. Exact canonical name/alias resolution and checked current source URLs determine binding; unresolved identities and stories are counted explicitly. Current grant/source checks precede reads and are repeated before release. Customer-evidence tools, profile product projection and ordinary current-knowledge packets reuse this reference metadata and its exact source lineage.

Ordinary owner-authorized native retirement was also missing: the reset route previously accepted only governed source-retirement capabilities. Its restored owner/CSRF path closes that ordinary research admission before forwarding the real native reset; governed retirement still requires its existing authority. Local checks reject missing CSRF and foreign sessions before changing admission. Native retirement is not asserted to purge application payloads; final test-data cleanup remains open.

The authenticated Preview cancellation check returned HTTP 202 for an owned background cohort after its initial reply completed; the originating attempt became cancelled and its live leases became zero. A later hosted recon reached the actual Terra specialist, Context/Exa reads and embeddings. It encountered an extra evaluation-only 120 KB prompt cutoff. The cutoff is removed: actual prompt bytes and bounded output are priced for each reservation, and the unchanged durable $15 cap denies unaffordable calls before provider I/O. A fixture-provider integration checks both a large affordable context and rejection of an unaffordable prompt without a second provider call. This is not yet a completed recon acceptance result.

The next hosted run exposed a duplicate-admission race: two rephrasings of the question created two leases for the same parent/kind, violating the specialist's unique-worker contract. Admission now locks that parent/kind slot and returns the existing key; concurrent rephrased requests create no second lease. Workflow return schemas validate the actual specialist output inside the executor; Eve supplies its own immediate background receipt. A terminal result without a reference also releases its reservation. Trusted native failure notifications may explain a recently expired job, while child/provider admission continues to reject expired leases and explicit cancellation. Current exact-source checks also recheck material conflicts on a preserved quotation's newest head.

### Inventory, source types and unpaid native checks

Preview schema 70 was applied after an encrypted recovery capture and matching-version restore/migration/grant rehearsal preserved 184 customers, 805 source revisions, zero human profile records and 23 conversations. The dated public inventory import added 144 references and bound 112 checked stories. Three legacy identities remain unresolved and one resolved story has no eligible checked source; none was guessed or used to create customer records. Replay imported zero duplicates. Ten owned research sources now retain their actual typed freshness classifications without changing original dates or quotations. One source needed five original quotes restored after an overlapping passage consumed its allowance; the governed writer now deduplicates overlapping checked excerpts, and a near-limit regression passes. This repair made no provider calls.

The unpaid local native fixture uses a provider replacement only inside an owned disposable app/database, with empty provider credentials and an unchanged authored root model. Actual Eve and headless WebKit delivered a correction on the same attempt/deadline and reloaded its answer. The initial Stop check failed on native turn association. Known lifecycle events now resolve their original durable turn association even when authentication already describes the next send; a late input cannot reopen a stopping attempt. A two-attempt regression passes. The repeated real-Eve/headless check passes correction ordering, the unchanged attempt/deadline, reloaded desktop/mobile history, actual native cancellation settlement and owner retirement (HTTP 200), with zero page errors and 16,391 conservatively accounted output tokens. The stopped provider holds remain inside the original 20,000-token allowance. This is neither actual-model quality evidence nor hosted acceptance. Both application builds and type checking pass after these final lifecycle/display repairs. The full unit suite passed 518 tests before the added correction-order regression, which also passes separately.

### Follow-up integration failures and repairs

Preview `ae43069` passed CLI headless WebKit form login on its immutable URL and branch alias, the 184-real-customer directory comparison, overview placement, 1Password/Notion products and source details, and desktop/mobile reloaded native-question history. One reload fetch was cancelled during navigation; no active-page error or overflow occurred. Read-only Notion lineage checks preserved all ten Production originals: eight remain current, two have checked successors, with eight additional Preview sources. A separate read-only index check found plural “Sandboxes” matches in current independent research for both profiles. It did not exercise the hosted paid HTTP search path. An actual owner reset of one allowlisted failed throwaway returned HTTP 200; application plaintext was not claimed purged.

CI exposed an integration mismatch between v2 parser output and v1-stamped new jobs. New uploads, retries and recovery checks now bind the actual parser policy, and retry selects the current prepared image digest. The actual scanner/parser/review/execution-journey check passes; its temporary database, app, store and public runtime assets are removed. Historical runs are not rewritten.

Other CI failures exposed provider-replacement harnesses still matching the pre-budget wrapper, and learning activation accepting only schemas 54/55. The owned fixture hooks now match the unchanged selected model inside its budget wrapper; live observers preserve that wrapper. Activation accepts the two historical schemas and the exact current manifest schema, retains migration-owner/environment checks and rejects an unknown future schema. A runtime-role compatibility regression passes.

The full 26,697-byte ordinary research prompt also exceeded the governed learning input ceiling by itself. Its authored text is now an embedded asset selected only for normal turns; the shared identity/evidence/action rules remain short. Old preview-first research instructions apply only to governed planning. Seven scope checks and all 16 actual Eve deterministic learning arms pass without raising input limits or making paid calls. The ordinary real-Eve/headless correction/deadline/history/Stop/retirement check passes again after this scope repair. Both builds and type checking pass; the unit suite passes 526 tests. The journey comparison also repaired matched-record selection, observation-date ordering, explicit offsets, original record identity, staleness and measured deltas; its disposable integration checks pass.

### Broader regression and upgrade compatibility

The earlier-domain regression cohort passes 436 tests in 122 files, plus 19 plan tests and three drafting tests, without skips. Snapshot-protocol tests now explicitly create pre-064 conversations instead of expecting newly created live chats to become historical. Their legacy cleanup consequently preserves its original scope. Domain-only chat fixtures settle only their allowlisted synthetic UUID-native attempts; the helper refuses real native workflow IDs. New partner/admin fixtures use real isolated principals, partner organizations, memberships and signed sessions, keeping production concurrency/rate limits unchanged.

Auth pruning now discovers actual login-session foreign keys and preserves sessions still referenced by immutable attempts, continuations or domain receipts. Nested owned regression clones copy only public runtime-image attestations/signatures/OCR assets from a matching test-marked local store, not application originals. Customer-conversation creation omits the live-context column on earlier schemas, preserving schema/code compatibility while the explicit upgrade runs. Learning recovery now verifies the exact current manifest instead of hardcoding schema 55. Its initial run completed functional phases but failed its source fingerprint after concurrent edits. The frozen-source rerun passed empty and schema-51 upgrades through schema 70, runtime grants, interrupted workers and two authenticated native app restarts on the same database/workflow. The separate partner recovery passed empty and schema-49 upgrades through its schema-51 boundary. Both made zero paid calls and removed their owned containers; neither is hosted proof.

The journey search comparison also restored record-based ranking and original paging rather than treating a ten-passage search response as a journey page. The shared canonical retrieval layer supplies authorization and embeddings; the original record RRF/semantic cutoff operates over current approved journey records. Keywords remain available before indexing completes. Returned records are re-read through the governed context layer and recorded in the ordinary source closure. Local 20+5 paging, pending-draft exclusion and forged-workspace denial pass. Read-only Preview/Production metadata found zero existing non-live customer-scoped ordinary conversations, so no conversion migration was added.

On Preview `82b8a4a`, headless WebKit again passed immutable/branch form login, the real directory, overview/products/source details, and private title/reloaded native-question history at desktop/mobile sizes. Two fetch errors occurred during reload, including a cancelled request; no active-page error or overflow occurred. The HTTP evidence search and new actual-model answer were not dispatched.

A later CI worker exposed another retention error: selecting immutable research payloads `FOR UPDATE` requires the UPDATE privilege that runtime correctly lacks. Bounded DELETE now acquires its own locks without granting payload modification; concurrent ticks can safely delete zero already-removed rows. The runtime-role retention regression passes with UPDATE still denied. The earlier retry fixture also now copies only the validated public image manifest into a private test-environment store, rather than borrowing the application store under a different environment marker.

### Exact Preview and schema-51 fixture check

Preview `d7b11c7` passed headless WebKit form login on the immutable URL and branch alias, the 184-real-customer directory comparison, overview-before-workloads placement, and 1Password/Notion product/source details. Desktop/mobile private native-question history and owner title editing passed; one reload fetch was cancelled and no active-page error or overflow occurred. The existing Notion source-lineage explanation remains applicable. No model or HTTP embedding search was dispatched. Screenshots were inspected directly.

All three focused delivery-handoff cases pass locally in desktop-dark WebKit, including the exact forecast review that timed out in the earlier CI run. This is a focused local result, not the full four-project gate. A newer partner regression exposed a test-only schema mismatch: its deliberate schema-51 environment has no live-context column. The historical fixture now sets the flag only on schema 64 or later; all five actual schema-51 conversation-delivery cases pass without changing production policy.

CI also exposed two verification adapters that differed from the production behavior they checked. The test identity/teardown guards now accept the canonical `turas_test` database name as well as its owned suffixed variants, while retaining the exact test-environment marker, deterministic-provider and synthetic-native-ID checks. The learning CI receipt verifier now requires the exact manifest schema used by its recovery runner, rather than rejecting a successful schema-70 recovery because it expected 55. The focused database/contract suite passes using the exact plain CI database name. The frozen-source empty/51-to-70 recovery and the actual CI receipt verifier pass together.

A read-only check of the legacy reference found no configured local database URL. Its development journey repository uses an in-memory fallback. This supplies no local database-backed journey history to migrate and does not establish the contents or retention of the former hosted deployment. The checked-in dated public inventory remains separately accounted for above.

### Current contract and long-history regression repairs

Ordinary evidence pagination added `nextPage` to the frozen staffing snapshot, whose strict versioned contract rejected dispatch before native IO. The staffing fence now retains its original snapshot shape; journey identity metadata is limited to journey reads. All five actual native staffing cases pass, followed by the complete 51-suite staffing manifest without skips. Both builds, type checking and the focused profile/chat runtime-role cohort pass. The initial local full-staffing attempt lacked the prepared scanner assets present in CI; rerunning with matching preparation passed the import cases as well.

The public-coverage reader also limited business-description fallback to its 20 newest eligible receipts. A bounded union now selects the latest 20 and the newest eligible nonempty description, using the same complete source closure for both. The regression inserts 25 focused empty-description receipts, preserves the older valid overview and rejects it after supporting content changes. Notion had 32 receipts with its description at rank 32; a read-only comparison additionally found two source heads no longer retained all original quoted text, including omissions from their current full documents. The repair correctly kept that older dossier withheld.

A separate actual headless WebKit read of Notion’s current official product page retained its current identity quotation. The normal operator research writer accepted that checked quotation into Preview, advanced the profile/source projection and returned an idempotent replay without model/provider calls. This is newly attributed independent research, not a reinstatement of the old dossier or an internal maturity/delivery assessment. Production is unchanged.

### Ordinary document intake restoration (in progress)

The legacy browser composer extracts supported documents before dispatch and wraps
that text as explicitly unverified user context. Its context-intent path creates
review drafts. This is distinct from independently checked specialist research.
The restored normal-chat path uses the same pinned officeparser 8 and MIME/extension
mapping, 10 MiB input and 120,000-character extraction bounds. Customer selection
is optional. Five documents and a 3 MiB framed message are bounded before dispatch;
plain prompts retain their 16 KiB limit. Migration 071 permits those framed sends.

Runtime-role disposable checks verify immutable send binding, one pending manual
claim, no accepted revision or retrieval passage, replay after customer rename,
foreign-owner denial and unchanged plain-message limits. Existing profile source
proof and review rules remain in force. Intake uses the immutable message date and
request identity. Extraction truncation is shown to the sender and retained in the
model envelope. Malformed framing is never hidden in history.

Actual text, Word, PDF and spreadsheet files now pass the general-chat composer
and intercepted native-send assertions across desktop/mobile WebKit in both themes.
Source selection/lifecycle regressions pass alongside them. Initial local waits produced a complete passing run, but the later hosted landing
check reproduced a lost first-file selection. The picker was enabled in server
HTML before its React handler was hydrated. It now stays disabled until hydration;
a controlled delayed-JavaScript WebKit check verifies both states and the first
selection in all four configurations. Hosted recheck of this correction is pending. The scrolling message
pane also has keyboard focus, resolving the serious WebKit accessibility finding.

An encrypted schema-070 Preview recovery capture restored and rehearsed migration
071 and runtime grants without changing 184 customers, 817 source revisions, zero
human profile records or 23 conversations. Migration 071 was then applied only to Preview after a fresh matching rehearsal.
Exact e05bd5b authenticated Preview checks prepared real text/Word/PDF/spreadsheet
files without dispatching a model, and preserved the existing reply and reloaded
history. Reload cancellation errors remain distinguished from active-page errors.
Hosted provider file execution and legacy native-file fallback remain open.
Production is unchanged; binary fallback is not represented as implemented.

The landing composer now prepares files before creating a conversation, matching
legacy’s initial attachment flow. Send transfers the full unverified envelope once;
opening Customer sources preserves an unsent draft instead of dispatching it. All
four headless WebKit configurations pass the actual text/Word/PDF/spreadsheet
landing-to-thread send checks, alongside source selection/lifecycle and chat-state
regressions. The legacy 12,000-character source excerpt remains in the pending
journey context; the signed owned-message proof retains its existing 8,000-character
contract limit.

A focused four-project WebKit check additionally verifies that opening Customer
sources keeps the attached draft and performs no native send. Runtime-role checks
cover both internal and assigned-partner intake, customer ambiguity, subsequent
grant revocation, cross-owner denial and the document release switch.

The hydration correction passes all twelve focused document/source-draft/delayed-
JavaScript WebKit cases and the web build. The previous a355cac hosted landing
attempt remains recorded as a failed first-file selection; it is not acceptance.
Sixteen allowlisted evaluation native sessions returned successful reset responses;
three test conversations had no native identity, and one retained question/history
thread remains for final checks. This is not application payload erasure.

Exact 6a1be36 authenticated Preview checks passed the corrected first-file
selection with actual text/Word/PDF/spreadsheet files, mobile layout and retained
reply/history. No model was dispatched. The full verify run subsequently found
four source-upload fixture failures: that workflow still clicked the landing
paperclip, and its input label collided with the chat picker. Source-upload checks
now open Customer sources, the chat input has a distinct accessible label, and
the focused four-project WebKit run includes source upload and passes.


### Native file fallback and corrections (local verification)

The ordinary composer now preserves legacy UserContent arrays when extraction is
unsupported or fails, with local-byte-only file input, a five-file/3 MiB transport
bound and the existing ten MiB source-file limit. Migration 072 stores immutable
original parts; dispatch binds their complete byte digest separately from Eve's
public text summary. Governed artifact selections retain their separate contract.
The default-disabled native upload switch also controls channel upload admission.
Preview remains at 071; Production remains unchanged.

The actual Eve runtime with a deterministic unpaid provider received identical
image bytes, invoked the real canonical customer resolver, exposed all three
specialists and evaluator, and retained the reply/file card after reload. A second
actual-runtime check consumed a native file correction inside the original response
attempt. Runtime-role tests reject changed-byte retries and foreign-owner access,
and verify one unchanged deadline/response allowance. These are local protocol
checks, not Grok quality or hosted Sandbox acceptance. The owned container and
prepared image were removed after each check.

Live normal-chat attachment intake now resolves the account mentioned by the
supplied content rather than forcing the selected profile. Internal and assigned-
partner regression cases verify that selecting account A while naming B creates
only an unaccepted B draft. Ambiguous, inaccessible and revoked accounts remain
unresolved; historical frozen context does not silently expand its account scope.
File metadata, without duplicated inline bytes or internal sandbox paths, is
retained in the application history projection for historical file cards.

The exact 1b99d9f Preview passed authenticated headless WebKit document preparation
and existing native-question history checks. Its full verify CI passed, while the
execution WebKit job timed out submitting a closeout. The same focused desktop-
light closeout suite passed locally; the CI failure is still unresolved. Added
save/submit response assertions will expose the response status/code on recurrence.


The headless WebKit composer also passes native-file correction and reload, with
both original and correction cards retained at mobile width. Correction document
intake selects its own immutable submitted message, retains current owner/session
and account-grant checks, and creates an idempotent pending human draft without
creating another response attempt. Runtime-role internal and partner cases cover
this path and reject an unrelated correction ID.


Migration 072 was applied only to Preview after a fresh encrypted schema-071
capture, matching PostgreSQL/vector restore, migration and runtime-grant rehearsal.
The rehearsal and application preserved 184 customers, 817 source revisions,
zero human profile records and 23 conversations, with no active attempts. The
native-payload column and runtime INSERT grant were verified. Its owned dump and
restore containers were removed. Native uploads remain disabled pending capped
hosted runtime admission and actual-provider acceptance; Production is unchanged.

Twenty-seven stopped Eve build-template sandboxes were deleted using the SDK's
explicit `deleteOrphanSnapshots:false`, and each original snapshot remained
retrievable afterward. Eve's deployment artifact uses that snapshot ID directly;
the temporary template name is not needed at runtime. No session sandbox or
snapshot was deleted. The three existing session resources remain unclassified.


### Personal preference memory compatibility

An actual local Eve save call exposed a 0.67.1 framework boundary defect for native
file turns: `context.messages.*.content.*.data` and `context.turn.input.*.content.*.data`
are URL objects, while durable memory callback creation accepts JSON values only.
The provider recalled successfully and returned save/remove tools, but framework
registration discarded their complete result. Plain-text save/recall, another-
caller isolation and removal pass with the unchanged provider.

A version/source-hash guarded installation repair converts only URL objects to
supported ModelMessage string data before that callback's existing strict JSON
validation. Other unsupported types retain their rejection behavior. It changes
no framework version, storage backend, namespace, scope, file format or model.
The repaired native runtime advertised both memory tools and executed a preference
save with original file bytes preserved. The native-file correction composer,
canonical account resolver and reloaded cards/reply pass separately in headless
WebKit. The combined long development test encountered the documented process-
local memory loss when Eve's optional sandbox setup rebuilt its development
runtime; this is not hosted Blob persistence evidence.

All 538 unit tests pass with isolated synthetic configuration, and both Eve and
web builds pass. Dedicated unpaid CI jobs exercise preference scope/persistence
and file/correction history. The exact 9f5aa8f hosted read checks passed the real
184-customer directory, first overview, 1Password/Notion products and source details,
private title/history and file preparation. Reload errors remain recorded; no
active-page errors or overflow occurred. Authenticated HTTP confirms native
uploads remain disabled on that Preview. Hosted `/eve/v1/info` returned 403 and
is not claimed as a positive inspection result. Production remains unchanged.

The file-correction fixture now waits for the runtime's actual abort signal before
resuming with the correction, instead of assuming a four-second browser timing
window. The local headless WebKit case passes original/correction byte delivery,
one parent response attempt and retained history. Its isolated application also
copies the pinned lockfile. CI failures emit a bounded synthetic failure reason;
raw startup logs and credentials remain private.

An optional conversation ID and expiry can restrict native files to one operator
check. Dispatch, correction, input continuation and provider execution recheck
that window; an in-flight provider receives its deadline signal. Runtime-role
checks cover another conversation, expiry and subsequent provider rejection.
These controls do not enable hosted native uploads or authorize infrastructure.


### Parked-question retirement and isolated browser startup

The cleanup rehearsal identified a retained evaluation turn in `waiting_input`.
Stop/retirement admission previously omitted that state. Ordinary cancellation now
closes it as `stopping`; application settlement requires Eve's exact terminal
`reset`/`no_active_session` receipt, or the existing `no_active_turn` cancellation
acknowledgment. An accepted request, failed response or another session's reset
receipt does not prove retirement. Runtime-role checks pass these distinctions and
verify watchdog settlement. Hosted recheck is still required before cleanup.

The latest file-correction CI failure exposed unresolved KaTeX fonts in the owned
application: its copied lockfile changed Turbopack's dependency root while installed
dependencies remain linked to the parent checkout. The isolated browser fixture
now uses the same webpack bundler as the hosted build and compiles a separate empty
owned thread before beginning the interrupted response. All three fixture specialists
inherit the selected pinned Docker sandbox, preventing Eve's optional default-provider
installation from replacing dependencies and rebuilding the development runtime. It still sends both files
through the actual composer, Eve runtime and provider adapter; compilation is not
counted as runtime correction latency. The local actual-runtime/headless WebKit file-correction check now passes with
original bytes, one parent attempt and reloaded history. CI verification remains open.

Exact `45c902f` authenticated Preview profile reads passed all 184 real customers,
1Password/Notion product source details, first overview placement and desktop/mobile
layout. Actual WebKit document preparation and the retained Desktop question answer
also pass. Two errors were recorded during navigation/reload cancellation; they
are retained in the private receipt rather than reported as zero errors. No paid
model or evidence search was dispatched by these reads.


On exact `cdb69d4` Preview, four old evaluation turns parked for input were reset
through their authenticated owner routes. Eve returned terminal retirement receipts
and their application attempts settled, with no model calls. An encrypted schema-072
capture was restored locally and the exact 19-conversation cleanup was rehearsed,
then applied to Preview. It deleted 556 dependent test rows and 19 conversations,
leaving four conversations, including the retained history-check thread. Protected
customer, source, independent-research, cache and cost-ledger fingerprints were
unchanged. Both owned recovery containers were removed. The retained thread and
private verification artifacts still require final cleanup.

Actual headless WebKit search for **Sandboxes** returned seven accepted Notion
research passages on `45c902f`, with no overflow. This used the existing
`lexical_degraded` fallback while the existing evaluation ledger was expired. The
provider operation count and accounted $4.515469 remained unchanged. No response
was substituted and no lexical-only request flag was added. This establishes the
real text-search path; hosted semantic search remains open.

CI exposed an additional in-turn optional-provider installation despite the pinned
fixture sandbox. The native test now creates its own complete dependency tree and
installs Eve's required optional local provider before startup, then verifies the
existing guarded memory repair. No checkout dependency link, authored model or
application dependency manifest is changed. The local file/correction WebKit check
passes with this preparation. CI remains required; no hosted quality pass is inferred.


With provider dependencies prepared before startup, the repaired native-file memory
turn now passes actual Eve preference save, fresh-conversation recall, another-caller
isolation, removal and a final fresh-conversation absence check. Original image bytes
remain identical and the runtime performs no dependency installation. These are
unpaid deterministic-provider checks of the real memory/runtime path, not hosted
Blob persistence. A separate CI case preserves this native-file regression alongside
the original plain-text preference and file-correction cases.
