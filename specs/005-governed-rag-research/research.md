# 005 research and decisions

Date: 2026-09-28. Planning evidence only; no installation, provider call, migration
or 005 runtime validation was performed. Two scoped research passes inspected
retrieval/domain integration and eve/public-research capability.

## R1 — Reuse governed source projections

**Decision:** Index current accepted profile projections, approved 004 excerpts,
server-verified attributed research, and published sanitized shared revisions.
Keep separate internal/delivery customer projections. Exclude private chats,
Pending records and whole uploaded originals. Index and query only synthetic or
public data in this release.

**Rationale:** `lib/server/profiles/context.ts` currently does substring matching
on `readProfile` output. `policy.ts`, `eligibility.ts`, `projection.ts`,
`artifact-excerpts.ts` and `quality.ts` already contain required policy. Extend
those boundaries instead of creating another authorization model. The existing
artifact excerpt DTO retains only the first selected locator; 005 must add a
versioned complete span/locator projection without widening text visibility.

**Alternatives:** Raw-document indexing then redaction violates approval and
pre-retrieval policy. Treating an accepted claim as approval of the whole artifact
would also bypass the 004 contract.

## R2 — Exact hybrid retrieval for the bounded local corpus

**Decision:** Postgres 17 with pgvector 0.8.6, exact cosine search over a materialized
eligible scope, English full-text search, and deterministic reciprocal-rank fusion.
Top 30 candidates per branch; score `sum(1/(60+rank))`; tie-break by citation ID.
B-tree scope indexes and GIN text indexing; no approximate vector index in 005.

**Rationale:** Existing Postgres is the source of authority. Exact scoped search
avoids recall being influenced by an unauthorized corpus. The documented pgvector
release supports Postgres 13+ and exact search; approximate filtering has distinct
recall behavior. Corpus and p95 acceptance remain measured Turas choices.
[pgvector](https://github.com/pgvector/pgvector),
[Postgres 17 text search](https://www.postgresql.org/docs/17/textsearch-controls.html).

**Alternatives:** External vector database adds infrastructure and duplicate
lifecycle work. HNSW/IVFFlat can be reconsidered after a measured scale requirement.

## R3 — Separate embedding contract from Turi's generation model

**Decision:** Use existing AI SDK `embed`/`embedMany` through AI Gateway with
`openai/text-embedding-3-small`, 1536 dimensions, cosine, and a versioned normalization/
chunking contract. Preserve `agent/agent.ts`. Never silently switch embedding models;
model/shape changes require a new index generation and explicit rebuild.

**Rationale:** The installed AI SDK resolves embedding model strings through
Gateway. Current Gateway documents embedding support; no extra provider SDK is
necessary. Configuration and real semantic evaluation remain implementation gates.
[Gateway embeddings](https://vercel.com/docs/ai-gateway/modalities/embeddings),
[model dimensions](https://vercel.com/ai-gateway/models/text-embedding-3-small).

**Alternatives:** Fake vectors are useful only for deterministic CI tests. A local
embedding runtime would add asset/runtime operations; lexical-only retrieval is
an explicit degraded mode, not completion of semantic acceptance.

## R4 — Research through application-controlled public requests

**Decision:** Use a minimal direct Context.dev Search HTTP adapter, configured by
the existing server-only `CONTEXT_API_KEY`, then an application-controlled HTTPS
fetcher. Request 10 search results because that is the provider minimum, retain
at most five URLs, and disable inline Markdown and highlights. Search results are
discovery hints, never evidence by themselves. Missing configuration yields a
visible unavailable result. The user chose the existing Context.dev credential
during implementation after asking how it compared with the initially planned
Exa adapter.

**Rationale:** Read-only eve registry inspection covered `tool/web_search`,
`tool/web_fetch` and `connection/context`. The Context.dev registry item is a
broader MCP connection with search, scrape, extraction and monitoring; only
exact server-owned URL discovery is needed here. Built-in provider-managed
search cannot enforce the application's exact outbound query receipt. Built-in
fetch returns useful text but insufficient response/provenance metadata for the
checked evidence boundary. The direct Search API returns an echoed query,
provider request ID and URLs; Turas retains only the bounded URL metadata.
[Context.dev Search API](https://docs.context.dev/api-reference/web-scraping/search).

**Alternatives:** Exa can provide the same URL discovery role but would require
another credential. Model-managed search puts query generation inside a model
tool call; after-call validation cannot constrain egress. The broad Context.dev
MCP connection would add unused capabilities and is not installed.

## R5 — Three research responsibilities, one bounded eve workflow

**Decision:** Implement `recon`, `practices` and `fit` as typed modes behind one
`defineWorkflowTool`, with replay-safe `use step` helpers. Recon/practices execute
finite server-built discovery/fetch plans and return attributed verbatim passages.
Fit has no egress path: it returns governed evidence/prerequisite/gap context for
Turi to synthesize. Turi's existing model generates the final response under
existing step/output fences. Missing evidence creates a proposed public request
that the user starts with its visible query scope. No declared runtime subagents
are needed in this slice.

**Rationale:** Roles are domain capabilities, not a requirement to add three model
sessions. Deterministic collection minimizes new model calls and makes request,
origin and budget checks enforceable before egress. This fulfills the roadmap's
role separation with the existing eve core. Keep root `web_search`, `web_fetch`
and unrestricted `agent` tools disabled.

**Alternatives:** Research agents considered hidden declared specialists with
`tool:false`, `defaultTools:false` and `ctx.agent`. The installed docs show that
children do not inherit root authored guards and have internal retry budgets.
They add authorization, output and spend boundaries without a demonstrated need
for 005. Do not port the old subagents simply because the demo had them.

Installed docs consulted: `node_modules/eve/docs/README.md`,
`tools/overview.mdx`, `tools/workflows.mdx`, `subagents/index.mdx`,
`agent-config.md`, `concepts/built-in-tools.md`,
`concepts/execution-model-and-durability.mdx`, `concepts/security-model.md`.

## R6 — Verified receipt, not model-supplied research checks

**Decision:** Retain the synthetic fixture boundary in
`lib/server/profiles/research.ts`; add a separate checked server ingest service.
Independent discovery/fetch receipts bind origin, canonical URL, public scope,
network checks, retained passage/digest and dates. Automatically persisted research
claims are attributed verbatim observations; paraphrased claims remain proposals
until their support is reviewed. Deterministic source-authority rules may assign
R=4 only to a retained official product passage about that product's behavior;
otherwise default R=1 until a steward rates the exact claim. D=4 requires an exact
retained quote, C is computed from independent support groups, F uses existing
quality code. No model boolean establishes a trusted check.

**Rationale:** The current synthetic-only ingest intentionally accepts trusted
fixture checks. Relaxing its literal would erase the origin/integrity boundary.
Fetched user URLs retain user origin, including redirect aliases and subsequent
refresh; discovering the same underlying page does not corroborate it independently.

**Alternatives:** Automatic model summaries with asserted directness would make
semantic correctness a prompt-only gate. Requiring all independent public quotes
to become accepted internal facts would collapse the evidence policy's distinction.

## R7 — Publication scope and authority

**Decision:** Published sanitized payloads are shared across active platform
memberships in the same environment, including different workspaces. Private
contributions and lineage retain their author/source workspace and source access.
Publishers are active internal administrators with access to every lineage
source. Non-admin authors can submit, edit their draft and view authorized lineage;
they cannot publish. The user confirmed internal-administrator-only publication
in clarification on 2026-09-28.

**Rationale:** D13 and the evidence policy already authorize platform-wide shared
reading. Current admin is also a customer steward. One exact publication decision
checks rights/sanitization and required source approvals; no duplicate customer
approval is introduced. Publication does not change source ownership or rights.

**Alternatives:** Every customer steward publishing globally widens authority.
A new publisher role can follow a user decision; it is unnecessary for the present
three-login local slice.

## R8 — Fail-closed lineage and recovery

**Decision:** Authority and source generations are current-state gates; search
projections are rebuildable copies. A source mutation commits its tombstone/
generation first. Reads and output fences evaluate dependent lineage immediately;
workers then invalidate/remove projections and content. Add monotonic consumed
retrieval/research/shared dependencies to the existing native-session fences.
No asynchronous fan-out delay is an eligibility grace period.

**Rationale:** Existing `attempt-context.ts`, artifact `context-fence.ts`,
`cleanup.ts` and `native-retirement.ts` establish the approach. A consumed source
from an earlier turn must continue to constrain replay and later model steps.

**Alternatives:** Deleting index rows alone leaves old snapshots and generated
history exposed. Synchronous full index rebuild on every mutation is unnecessary.

## R9 — Bounded local release and retention

**Decision:** See the numeric contracts for retrieval, research and worker budgets.
Keep raw fetched bodies only for normalization (delete within 24 hours after
interruption); retain selected evidence while eligible. Purge retired passage,
embedding and derived payloads within 60 seconds on a healthy local worker, with
immediate logical denial. Keep minimal content-free operational receipts 30 days;
retain required decision audit without payload. No real-customer retention claim.

Use explicit 019–022 migrations, vector-capable Postgres 17 in disposable checks,
and matched database/store restore. Pin the concrete image digest during
implementation after verifying the chosen platform manifest; no invented digest
in planning. No selected database replacement or schema migration now.

## R10 — Evidence needed to finish implementation

**Decision:** Deterministic domain/HTTP/race tests, real pgvector storage tests,
judged real-embedding relevance evaluation, 12 reviewed actual agent/research
scenarios, four-project CLI WebKit and disposable upgrade/recovery evidence.
Ordinary CI uses deterministic provider fakes; live commands need `--live` and
explicit bounded budget. Live retrieval must meet the spec's recall@5 target;
fake-vector tests do not prove that target. Hosted behavior remains unverified.
