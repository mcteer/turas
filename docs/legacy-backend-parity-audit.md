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
| Identity, session and role authorization | lib/auth/ | lib/server/auth/ | Comparing |
| Private chat ownership and durable binding | lib/conversations/; agent/hooks/conversation-owner.ts | lib/server/conversations/ | Comparing |
| Canonical name, aliases and documented workload resolution | agent/tools/resolve_customer_account.ts; lib/customer-evidence/repository.ts | Named resolver and governed reads restored locally | Local unit/integration checks pass; hosted verification pending |
| Customer evidence and longitudinal journey | agent/tools/get_customer_evidence.ts; get_customer_journey.ts; lib/customer-journey/ | lib/server/profiles/ | Comparing |
| Human claim capture, review, revision and retraction | capture_customer_context.ts; app/api/context-approvals/ | lib/server/profiles/; lib/server/artifacts/ | Comparing |
| Research admission, reuse, leases and duplicate suppression | agent/tools/prepare_customer_research.ts; lib/research-cache/requests.ts | lib/server/research/requests.ts | Legacy admission/reuse/join tools restored; automatic ordinary-chat routing restored; hosted checks pending |
| Recon, practices and implementation specialists | agent/subagents/; agent/lib/research-context-tool.ts | Omitted; specialist contracts/cache/provider implementation now ported under lib/server/research/specialists/ | Three workers and typed workflow handoffs compile; hosted behavior pending |
| Durable joining, background activity and cancellation | wait_for_customer_research.ts; lib/chat-messages.ts; task_cancel.ts | Research polling/native attempts | Comparing |
| Provider discovery and rendered source readers | lib/solution-research/{independent-search,provider}.ts; lib/research-cache/fetch.ts | lib/server/research/ | Partially ported; verify full path |
| Source integrity, focused passages and attribution | lib/solution-research/{source-integrity,source-focus,attribution}.ts | lib/server/research/ | Partially ported; verify contracts |
| Publication/event chronology and freshness | release-chronology.ts; freshness*.ts | lib/server/research/; profiles/quality.ts | Comparing |
| Checked knowledge persistence and customer updates | customer-update*.ts; lib/research-cache/public-learning.ts | public-persistence.ts; specialists/retain-profile.ts | Local assigned-partner persistence, recheck, late-document indexing and revocation checks pass |
| Hybrid retrieval, embeddings and index invalidation | lib/customer-journey/{memory,embeddings,search-store}.ts | lib/server/retrieval/ | Comparing |
| Signed research artifacts, handoffs and solution decisions | agent/lib/research-handoff.ts; lib/solution-research/{artifacts,receipt,decision-workflow}.ts | lib/server/research/; lib/server/plans/ | Comparing |
| Reusable solutions and customer-specific applications | lib/solution-patterns/; get_solution_knowledge.ts | lib/server/knowledge/workspace-patterns/ | Complete legacy fields and six-dimensional target fit restored; current source withdrawal invalidates reuse locally |
| Customer learning and consent | lib/customer-learning/; get_adoption_patterns.ts | lib/server/learning/customer-adoption/ | Original metric, contribution consent/versioning and cohort suppression restored; local checks pass |
| Capacity, interventions, scenarios and services arithmetic | lib/demo/{metrics,services-plan,repository}.ts | lib/server/{staffing,execution,finance}/ | Compare calculations; fake records remain test-only |
| Attachments, text extraction and context submission | lib/attachment-extract.ts; lib/chat-attachments.ts; intake route | packages/artifact-extractor/; lib/server/artifacts/ | Comparing |
| Connections, registry discovery and generic runtime tools | agent/connections/; connection_search.ts; built-in tool exports | agent/connections/; installed eve tools | Compare used capabilities; no credentials or unused demo connectors copied |
| Model/context assembly, memory, skills and tool availability | agent/agent.ts; instructions.md; agent/memory/; agent/skills/ | agent/ | Comparing; preserve current selected model |
| API routes and maintenance/recovery entry points | app/api/; agent/channels/ | app/api/; agent/channels/; operations/ | Comparing |
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
| `capture_customer_context` | Pending comparison |
| `connection_search` | Compared: original provider-discovery guard retained. Customer lookup routes to the canonical resolver; missing private data does not trigger connector installation. |
| `evaluate_solution_research` | Pending comparison |
| `get_adoption_patterns` | Authored report contract ported; legacy owner maps to current internal administrator. Original metric inputs, consent, quarter/version semantics and minimum five-account cohort suppression are covered locally. Hosted acceptance open. |
| `get_capacity` | Legacy returns fixed synthetic demo capacity. Current `read_staffing_capacity` uses governed real staffing inputs; legacy ordinary-chat capacity routing remains a gap. No demo figures imported. |
| `get_customer_evidence` | Governed named reads now retain original passages, product identity and separate source/check dates. Byte-limited pagination fixed. Hosted check pending. |
| `get_customer_journey` | Hybrid retrieval and explicit recent fallback restored locally. Current dependency/grant fences retained. Hosted check pending. |
| `get_customer_research_update` | Pending comparison |
| `get_engagement_brief` | Legacy reads a synthetic brief from `lib/demo/repository`. Current execution summaries and delivery-plan reads use authorized real engagements; ordinary-chat brief routing remains a gap. No fictional brief imported. |
| `get_learning_contribution` | Original account/quarter contribution read contract ported with current live administrator authorization and normal-chat availability. No automatic contribution consent. Hosted acceptance open. |
| `get_portfolio_summary` | Legacy returns fixed-date synthetic portfolio exceptions from `lib/demo/repository`. No production data behavior exists to copy verbatim; governed real portfolio reads need explicit ordinary-chat routing. Fake records excluded. |
| `get_public_customer_learning` | Original account-wide public passage read contract ported, with canonical source/dependency and current-access fences. Original dates, contrary evidence and refresh flags retained; cross-account examples remain public-only. Hosted reuse acceptance open. |
| `get_solution_knowledge` | Original account applications/context-hash/invalidation read contract ported to canonical approved records. Private publication lineage remains steward-restricted; no automatic publication. Local source-withdrawal checks pass; hosted acceptance open. |
| `list_customer_evidence` | Pending comparison |
| `load_skill` | Ordinary chat delegates to installed Eve native `load_skill` as legacy does. Existing governed workflows retain their authorized domain adapters. Generic root filesystem tools remain unavailable; hosted ordinary skill-load acceptance open. |
| `prepare_customer_research` | Pending comparison |
| `read_file` | Both builds disable arbitrary filesystem reads. |
| `record_engagement_intervention` | Legacy can mutate only the literal fictional `eng-notion-pilot`, with exact-version/idempotency checks and human approval. Current execution/staffing decisions preserve real authorization and approval; ordinary-chat routing is not yet equivalent. Fictional mutation not installed. |
| `resolve_customer_account` | Exact name/alias priority, documented workloads and ambiguity ported to current canonical UUIDs; grants checked before lookup. Local tests pass. |
| `review_learning_contribution` | Original explicit contribution approval command ported with live internal-admin/account review authorization, exact versions and idempotency. Consent is separate from research acceptance. Local checks pass; hosted approval acceptance open. |
| `review_solution_application` | Original separately approved target adaptation retained, including all six fit dimensions, validation plan, context hash and version/idempotency checks. Current account-steward policy replaces demo owner identity; hosted approval acceptance open. |
| `review_solution_pattern` | Original separately approved generalized derivative publication/withdrawal retained, with source-steward review, redaction/outcome attestation and exact source/version lineage. Local withdrawal/invalidation checks pass; hosted approval acceptance open. |
| `search_solution_patterns` | Original same-workspace eligible-derivative search and target-context hash contract ported. Similarity grants neither target approval nor source-record access. Local six-dimensional fit/source invalidation checks pass; hosted acceptance open. |
| `task_cancel` | Static native tool restored with owned background-task admission; authenticated Preview cancellation returned 202 and left zero live research leases. |
| `todo` | Removed by the installed Eve framework. Its changelog explicitly requires removing `agent/tools/todo.ts`; `eve/tools/todo` returns `ERR_PACKAGE_PATH_NOT_EXPORTED`. No fictional replacement or unsupported export added. |
| `wait_for_customer_research` | Pending comparison |
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

The authenticated Preview cancellation check returned HTTP 202 for an owned background cohort after its initial reply completed; the originating attempt became cancelled and its live leases became zero. A later hosted recon reached the actual Terra specialist, Context/Exa reads and embeddings. It encountered an extra evaluation-only 120 KB prompt cutoff. The cutoff is removed: actual prompt bytes and bounded output are priced for each reservation, and the unchanged durable $15 cap denies unaffordable calls before provider I/O. A fixture-provider integration checks both a large affordable context and rejection of an unaffordable prompt without a second provider call. This is not yet a completed recon acceptance result.

The next hosted run exposed a duplicate-admission race: two rephrasings of the question created two leases for the same parent/kind, violating the specialist's unique-worker contract. Admission now locks that parent/kind slot and returns the existing key; concurrent rephrased requests create no second lease. Workflow return schemas validate the actual specialist output inside the executor; Eve supplies its own immediate background receipt. A terminal result without a reference also releases its reservation. Trusted native failure notifications may explain a recently expired job, while child/provider admission continues to reject expired leases and explicit cancellation. Current exact-source checks also recheck material conflicts on a preserved quotation's newest head.
