# Retrieval contract v1

## Interfaces

`POST /api/retrieval/search` and eve `search_evidence` call the same
`lib/server/retrieval/search.ts` service. `GET /api/retrieval/citations/:id`
resolves only the current reader's permitted exact spans. All routes use existing
session/CSRF guards. Never trust actor, environment or grants in request JSON.

Input: `scope` (`customer`, `shared`, `combined`), canonical `customerId` and
optional `workloadId` for customer/combined, trimmed `query` (1–500 characters),
`use` (`discovery` or `current_fact`, default discovery), `limit` (1–10, default 5).
Turi's factual-context tool uses current_fact. Shared-only requests reject a
customer/workload selector rather than silently widening/narrowing the request.
The UI labels English retrieval coverage; every response declares `language: en`
and a reduced-coverage caveat for other languages without claiming reliable
language detection. Query text is treated as search data, never executable SQL
or model instructions; embedding input remains bounded by the same query limit.

Output: version `retrieval-v1`, opaque receipt ID, as-of/valid-until times,
`mode` (`hybrid`, `lexical_degraded`), completeness warnings and ≤10 results.
Each result contains opaque citation ID, evidence class, permitted title/text,
complete exact locator spans, public-safe source dates, quality components/band/
rationale, applicability/product version, caveats and extraction warnings.
Customer source URLs are visible only when the underlying approved projection
allows them. Shared citations never contain private lineage or source identities.
No total corpus count, hidden filtered count, vectors or SQL/ranking internals.

403/404 follow existing opaque unauthorized/not-found convention; 409 signals
stale context, 422 invalid input, 429 rate limit, 503 schema/provider unavailable.
An empty eligible corpus returns an empty result with an evidence-gap explanation.
A semantic failure permits labeled lexical results; both branches failing is
unavailable. A citation withdrawn after search resolves as unavailable, never an
old cached passage. Responses are private/no-store and each UI action reauthorizes.

## Authorization, quality and ranking

1. Lock/revalidate current environment, principal, membership, session, customer
   and partner grant using the existing profile policy; authorize shared scope
   independently through active membership in the same environment.
2. Build a materialized eligible relation of current accepted projections,
   exact approved excerpts, verified research and eligible publications. Source
   support, audience projection and lineage gates precede either ranking branch.
3. Use English full text (`websearch_to_tsquery`, `ts_rank_cd`) and exact cosine
   distance over that relation, each top 30. RRF score sums `1/(60 + rank)`;
   stable tie order is citation ID. Collapse identical permitted passages within
   a source revision; return ≤2 per source revision, ≤10 total, ≤24 KiB JSON.
4. Recheck current authority/generations/quality under the existing release fence,
   record exact consumed dependencies before model use, and stop on invalidation.

`discovery` may show eligible stale/weak/unknown/conflicted evidence with explicit
caveats. `current_fact` excludes weak/insufficient, stale/unknown freshness and
confirmed material conflicts. Pending/rejected/retracted/superseded/withdrawn,
unsupported or unauthorized evidence is absent from both. Current relevance
never overrides quality or source gates. Preserve existing quality-v1 review
windows, overdue cap, unknown/future date behavior and independent-support rules.

## Index and numeric budgets

| Boundary | Limit |
| --- | --- |
| Query embedding | One call, 10 seconds, no automatic retry |
| Embedding contract | `embedding-v1`: openai/text-embedding-3-small, 1,536 dimensions, NFC text, no approval-crossing chunk overlap |
| Passage | ≤2,000 characters, one approved unit/span; stable digest |
| Index batch | ≤32 passages/call, ≤2 concurrent calls, 10 seconds/call |
| Query DB ranking | 2 seconds statement deadline; no network call under DB locks |
| Retrieval admission | 30/minute/principal, ≤5 active/environment |
| Worker processing | ≤2 jobs concurrently; 30-second leases; ≤3 attempts/generation |
| Healthy convergence/retired cleanup | ≤60 seconds; eligibility revocation is immediate |

Only current authorized projections enter embedding requests. This local slice
accepts synthetic customer/public data; it does not authorize private customer
rollout. Embeddings use the existing AI processing boundary and separate contract,
not the public-research query channel. Root model selection stays unchanged.
Do not log query/passage text or reuse a query vector across principals/scopes.
Provider ambiguity is recorded unconfirmed; current query degrades to lexical
without resending. Contract mismatch or invalid vector cannot participate in
semantic scoring. Backfill and rebuild use explicit maintenance commands.

## Citation fidelity

Derive locator spans from all approved units, including disjoint page ranges,
slides, sheets/cells and lines. Carry both normalized text offsets and original
004 locators, passage digest and extraction warnings. Resolving never fetches
neighboring original text. Accepted structured profile fields use field-path and
revision locators. Public research uses retained text offsets plus canonical URL
and date provenance. Shared publication uses its public revision/field locator.
Payload minimization occurs before ranking, embedding, snippets and citation DTOs.

## Required contract evidence

Equivalent UI/tool receipts; current policy denials; cross-scope sentinel ranking
invariance; multi-unit citation fidelity; lexical degradation; quality/date
boundaries; output/history/reconnect invalidation; no hidden result counts; real
pgvector storage; real-embedding relevance and specified 5,000-passage load test.
