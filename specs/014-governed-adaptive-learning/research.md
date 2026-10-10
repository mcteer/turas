# 014 Research Decisions

Two read-only research tracks inspected existing knowledge/publication and
report/gap/partner measurement seams. A follow-up inspected 011 native model
admission after the drafting/evaluation clarification. No legacy instruction or
implementation was adopted without checking the active contracts.

| Decision | Rationale and evidence | Alternatives considered |
| --- | --- | --- |
| Extend 005, preserve internal-admin publication authority | `lib/server/knowledge/{service,policy}.ts` already owns immutable revisions and publication. The 005 authority is any current internal administrator, unlike 012/013's mcteer-only decisions | A second practice store or mcteer-only publication would create conflicting authority |
| Feedback is a trigger, not factual lineage | `reports/measurements.ts`, `gaps/dependencies.ts`, `partners/sources.ts` re-resolve originals; 012 disclosure and 013 verification confer no shared reuse right | Treating report text or training success as accepted customer facts is unsafe |
| Keep candidate lineage customer-bound | `lib/contracts/knowledge.ts`, migration 020 and `knowledge/lineage.ts` allow 1–20 accepted-profile/verified-research revisions from one customer | Shared-on-shared lineage and cross-customer candidates require a larger source-contract change; excluded |
| Bind review/evaluation to exact closure | Existing `content_digest` hashes sanitized wording, not all lineage and rights | A content-only digest misses changed authority and supporting evidence |
| Gate in the existing publication transaction and database | Every route must go through `decideKnowledgeCandidate`; an activation-aware database guard prevents old deployed writers from bypassing the gate | UI-only gating and an optional new release route leave existing 005 decisions able to bypass |
| Withdrawal targets published head | `withdrawKnowledge` currently compares with the latest candidate, which can block withdrawal when a draft exists | Deleting a newer draft or waiting for evaluation would delay a necessary withdrawal |
| Rollback authors a new revision | Historical wording can be useful; rights and evidence must still be current | Reactivating a withdrawn revision revives stale authority |
| Turi drafts and evaluates; administrators publish | Explicit user clarification, 2026-10-09 | Monitoring-only automation was offered and not selected |
| One new native learning feature, three immutable purposes | Reuse 011 lifecycle with `draft`, `evaluation_baseline`, `evaluation_candidate`; freeze the purpose in the binding | Generic unrestricted chat and duplicated provider adapters undermine common fences |
| Production budget admission is new domain work | 011's explicit USD ledger is in `scripts/expansion-live-budget.ts` and `tests/fixtures/expansion/live-provider.ts`, not production admission | Calling fixture setup or runtime DDL from the app is prohibited |
| Fixed paired evaluation, human grading | Checked-in cases, identical case context and independent arms; exact captures and all criteria start unreviewed | Model self-grading, candidate-selected tests and cherry-picked successful reruns cannot qualify release |
| Internal-only fixed quarterly aggregates | Explicit user clarification; `docs/evidence-policy.md` separates shared practices from statistics | Public/partner aggregates and arbitrary filtering exceed approved scope |
| One single-cohort release per metric/quarter across protocol versions | k≥5 alone does not stop differencing; ledger prevents replacement subsets and version-based evasion | Legacy `aggregatePatterns` warns about differencing but does not enforce it; intervention comparisons and revised releases are excluded |
| Structured metric protocols, accepted originals | Existing outcome values are free-text-labeled decimals and do not establish comparable populations/windows | Matching metric names, averaging maturity or pooling partner attempts is invalid |
| Bounded refresh and synchronous fences | `research/refresh.ts` marks due records without external calls; `retrieval/fences.ts` enforces current eligibility | An unconstrained recurring research agent would add unknown cost and approval scope |
| Private retention with earlier-source precedence | Reuse 011/013 payload separation, immutable receipts, native retirement and bounded workers; preserve stricter 005 cleanup | Generic long-lived audit JSON can retain revoked private content indefinitely |
| Explicit release verification | Production required a 045→051 recovery on 2026-10-09 despite green pre-merge CI; see `docs/production-recovery-2026-10-09.md` | Merge/deployment status alone does not prove schema or user workflows |

## Implementation references

- Knowledge: `lib/contracts/knowledge.ts`, `lib/server/knowledge/{service,policy,lineage,read,quality,suspension,impact}.ts`;
  `lib/server/profiles/eligibility.ts`; migrations 020/023.
- Retrieval: `lib/server/retrieval/{projections,jobs,search,citations,context,fences,cleanup}.ts`.
- Native: `lib/server/expansion/{advisory,context,tool-actor,native,native-admission,native-events,native-release,native-reconcile,native-retirement,advice-invalidation,maintenance}.ts`;
  `lib/server/conversations/{feature,model-admission,dispatch,projection,release-preflight,native-release,context-fence,reconcile,cancel,repository,eve-routes}.ts`;
  `lib/server/staffing/{native-context,context,model-budget}.ts`.
- Agent: `agent/hooks/guard-customer-context.ts`, `agent/tools/load_skill.ts`,
  feature-aware instructions/tools, `agent/channels/eve.ts`. Preserve `agent/agent.ts`.
- Evaluation: `scripts/{eval-expansion,expansion-review-contract,verify-expansion-review,execution-source-digest}.ts` and
  `tests/fixtures/expansion/evaluation.ts`. Do not transplant source-rewriting fixture helpers into production.
- Measurements: `lib/server/reports/measurements.ts`, `lib/reports/calculations.ts`,
  `lib/server/execution/handoff-schema.ts`, current execution source/acceptance services.
- Privacy/maintenance: `lib/server/gaps/{dependencies,eligibility,invalidation,quality-expiry,maintenance}.ts`,
  `lib/server/partners/{policy,sources,projection,progress,maintenance}.ts`, `scripts/maintenance-worker.ts`.
- Legacy, read-only: `../turas-back/agent/skills/customer-learning/SKILL.md`,
  `../turas-back/lib/research-cache/{public-learning,practice-library}.ts`,
  `../turas-back/lib/customer-learning/schema.ts`, `../turas-back/lib/solution-patterns/`.

Installed eve documentation read: `docs/README.md`, `tools/overview.mdx`,
`skills.mdx`, `evals/overview.mdx`, and the Vercel deployment guide for the separate
Production recovery. No external integration is needed for this generic capability.
Implementation must read the relevant installed Next guides before framework edits
and eve context/lifecycle guides before extending native execution.

No unresolved research decision remains. Provider pricing must be validated at
paid admission against the then-current configured model; this is a runtime gate,
not permission to substitute a model or assume today's rates indefinitely.
