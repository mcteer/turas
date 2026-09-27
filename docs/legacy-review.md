# Demo reference review

Reviewed 2026-09-26 at `../turas-back`. The old repository was not modified and its
production data was not migrated. Findings come from source review, not a rerun of
the demo's tests or a certification of its deployment. Test names below identify
useful coverage to port, not passing checks in this repository.

## Review coverage and disposition

| Area and reference paths | Finding | New-build disposition |
| --- | --- | --- |
| `agent/instructions.md` | Rich customer advocacy, source discipline and delivery guidance, mixed with fixtures and accumulated regression instructions | Condense root policy; port feature-specific behavior with tests |
| `agent/skills/customer-maturity-journey/SKILL.md` | Six maturity stages, six independent dimensions, outcome evidence and next milestone | Adapt in 003; do not average qualitative states |
| `agent/skills/delivery-methodology/SKILL.md` | Qualification, value/production tracks, acceptance, decision rights and handoff | Adapt in 006/008; use charter as plan-template input |
| `agent/skills/engagement-health-and-risk/SKILL.md` | Useful risk/issue/dependency/decision distinctions and action-oriented health | Adapt in 003/008/009 |
| `agent/skills/customer-posture/SKILL.md` | Sourced account history and careful product naming | Adapt in 003; reconcile draft-capture policy |
| `agent/skills/services-business-review/SKILL.md` | Economics and operational explanations tied to synthetic assumptions | Retain principles in 007; discard fixture values and stale runtime claims |
| `agent/skills/solution-research/SKILL.md` | Context fit, citations, alternatives and conditional value reasoning | Adapt in 005/006 |
| `agent/skills/customer-learning/SKILL.md` | Explicit reuse consent, comparability and cohort suppression | Adapt in 014, expand beyond one administrator-adoption metric |
| `agent/subagents/customer-recon/` | Account current-state research and scoped typed handoffs | Reintroduce only with 005's used research path |
| `agent/subagents/vercel-best-practices/` | Reusable product/topic practices separated from customer facts | Reintroduce with governed practice library in 005 |
| `agent/subagents/implementation-research/` | Synthesizes recon and practices into solution fit; no general independent search | Adapt in 005/006; revalidate model/budget/runtime contracts |
| `lib/customer-journey/{schema,repository}.ts` | Revisioned draft/approved/retracted context, optimistic concurrency and request IDs | Preserve invariants; replace demo authorization and IDs |
| `lib/customer-journey/{memory,search-store,embeddings}.ts` | SQL/pgvector hybrid retrieval, current-record rechecks and stale-index protection | Port patterns into 005's document RAG |
| `lib/solution-research/` | Source integrity, citations, dated chronology, signed artifact handoffs, explicit incomplete results | Preserve evidence contracts; simplify where current eve supports them |
| `lib/research-cache/{public-learning,practice-library}.ts` | Public passages and reusable practices separated from private questions | Adapt in 005/014; no private context in shared cache |
| `lib/solution-patterns/` | Separate approval for publication and customer adaptation, context hash invalidation | Useful input to 006/014; not a full tracked delivery-plan lifecycle |
| `lib/demo/{metrics,services-plan}.ts` | Deterministic contribution, capacity, rate and annual-plan calculations | Rewrite against real contracts in 007; retain arithmetic test intent |
| `lib/auth/`, `agent/channels/eve.ts`, `agent/hooks/conversation-owner.ts` | Demo owner/reviewer sessions plus server-bound conversation ownership | Rebuild identity for 002; preserve owned-session invariants |
| `lib/attachment-extract.ts`, `lib/chat-attachments.ts`, intake routes | Many formats, presentation markers, text extraction and draft submission | Replace storage/ingestion in 004; retain useful UX |
| `app/`, `components/`, `tests/ui/` | Clear sidebar/chat, profiles, approvals and operations views | Visual contract in design-reference; port only used components |
| `agent/connections/`, vendor archive, retired integration references | Demo-specific or unused integration history | Do not copy or install by default |

## Concrete issues the fresh design resolves

1. The maturity skill uses Explore → Transform, while persisted journey stages use
   Discover → Align → Build → Prove → Adopt → Expand → Renew. The new design separates
   maturity, delivery phase and record state rather than importing competing enums.
2. Root instructions/capture tooling permit draft submission before owner review,
   while customer-posture prose asks approval before capture. New policy permits
   submission and extraction, then gates factual acceptance once on the server.
3. Attachment extraction flattens Office/PDF content, limits input to 10 MB and
   truncates at 120,000 characters; intake keeps only 12,000 characters. Journey RAG
   embeds roughly 2,000-character JSON-note chunks. This is not sufficient for
   full-document lineage or spreadsheet row/cell competency evidence.
4. Attachment account detection relies on name substring matching against a static
   public catalog, with duplicate capture paths. Use explicit canonical customer
   binding, durable artifact IDs and idempotent ingestion instead.
5. Demo owner/reviewer permissions cannot express partner/customer grants, personnel
   costs, internal commercial fields or delegated context stewardship.
6. Freshness ratings exist, but reliability, directness, corroboration and acceptance
   need separate scored and governed fields. Freshness is not factual correctness.
7. Some business-review warnings describe older client-bound ownership despite
   current server binding and a disabled client bind endpoint. Do not copy historical
   caveats as current findings. Old benchmark scores are likewise not new-build proof.
8. Schema initialization issues CREATE/ALTER inside runtime paths. Replace it with
   managed migrations and disposable integration-test databases.

## Greenfield capability gaps

The demo has synthetic operations and planning views, not a real competency,
allocation, timesheet or delivery-log lifecycle. It lacks canonical accepted/tracked
delivery plans, dedicated TAM/expansion workflows, branded report generation and
delivery, product-gap registry/counting, partner enablement/access, and an inbound
Turas MCP service. Its approved patterns and learning mechanism are valuable inputs,
but not completed implementations of those requirements.

## Reuse verification map

- `tests/customer-journey.test.mjs`, search/DB integrations: isolation, approved-only
  reads, revisions, retraction, duplicate submissions, index convergence.
- Citation, source-integrity, freshness and chronology tests: unsupported passages,
  invented dates, stale evidence and conflicting release history.
- `tests/customer-learning.test.mjs`: comparable measurements, reuse revocation,
  minimum cohorts and suppression.
- `tests/demo-metrics.test.mjs`, `services-plan.test.mjs`: formulas and invalid inputs.
- `tests/ui/`: sidebar/mobile layout, attachments, approvals and conversation ownership.
- `evals/customer-engagement-routing.eval.ts` and other evals: account/connector
  collisions, synthetic leakage, source fidelity and bounded research failures.

Port expectations into each new spec. Do not import old credentials, databases,
customer snapshots, vendor tarballs, blanket dependencies, model selections, or
test results. No runtime code from the demo was copied in the foundation.
