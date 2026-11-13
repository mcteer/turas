# Implementation Plan: Fresh guidance and retained learning

**Branch**: `022-fresh-guidance-learning` | **Date**: 2026-11-13 | **Spec**: [spec.md](spec.md)

## Summary

Enforce fresh guidance in the existing retrieval domain, pass current/historical
intent through the separate public-practice reader, and make Turi automatically
use its existing prepare/research/result tools for due or missing support. Preserve
admission, accounting, source persistence and reviewed publication. Repair the
fallback purge so empty retired identities cannot starve subsequent batches.

## Technical Context

- TypeScript, Node 24, existing PostgreSQL/pgvector, Zod, Vitest and installed eve.
- No new dependency, model, research provider or UI change. Migration086 records
  current-only public-practice expiry across model steps and restarts.
- The selected model remains unchanged. Ordinary search remains a dynamic tool;
  existing durable specialist workflow tools continue to own paid research.
- Seven days is a separate guidance freshness deadline; original quality windows
  and dates remain visible for history. Earlier cache/review deadlines still apply.
- Tests use owned disposable Postgres and synthetic providers/data. Current test
  commands loading .env.local are not used. No hosted or actual-model claim follows
  from synthetic tests.
- Keep existing limits: 10 retrieval results/24 KiB, 8 public references, existing
  research scope/budget/deduplication and 100-source cleanup batches.

## Constitution Check

Pre- and post-design: pass. This bounded spec precedes code; authorization and
source lifecycle remain in domain services; factual approval/shared publication
remain human-governed; no changes to maturity calculations or model selection.
Agent behavior requires representative evaluation and hosted release evidence.
These acceptance checks remain explicit tasks, not inferred from source inspection.

## Project Structure

- `lib/contracts/retrieval.ts`, `lib/server/retrieval/{context,quality-read,search,cleanup}.ts`
- `lib/server/knowledge/quality.ts`
- `lib/server/conversations/practice-evidence.ts`
- `lib/server/research/specialists/{solution-research/freshness,research-cache/practice-library}.ts`
- `agent/tools/search_evidence.ts`, `agent/instructions.md`, relevant research skill/instructions
- Existing retrieval, practice-persistence and research-cache tests; a seven-day unit suite.
- `README.md`, `ROADMAP.md`, `docs/evidence-policy.md`, this feature's validation record.

## Implementation sequence

1. Regression tests for >100 retired sources and seven-day/default/history behavior.
2. Add an optional guidance deadline to evidence quality, computed from original
   evidence dates and earliest review deadline; do not alter quality rubric bands.
   Reconstruct the deadline for legacy shared quality from authorized lineage.
3. Apply current-guidance eligibility before ranking, retaining post-ranking
   original-source/quality checks. Explicit accepted/discovery reads keep old evidence.
4. Filter public practices before candidate limits using authoritative snapshot
   dates/deadlines, with current live docs observed at check time and dated reports
   preserving publication age. Recheck at disclosure. Pass intended use from tool.
5. Default the tool to current_fact; root/research instructions automatically prepare
   then launch the matching admitted specialist on missing/due support. Reuse/join
   results and report no-newer-evidence/missing-scope/budget failures without loops.
6. Persist current-only practice deadlines in migration086 and fence model/output
   through customer-accounts.ts; retire expired active dependencies through
   current-knowledge.ts, preserving the separate withdrawal history.
7. Purge only retired sources that still have passages; keep locks, bounded batches,
   grace period and source audit identities.
8. Run targeted tests/typecheck, document actual checks and remaining release gates.

## Rollout and rollback

Migration086 adds ordinary_practice_guidance_reads and runtime grants. Its active
expiry accounting is separate from the existing append-only withdrawal ledger.
Current-only reads record deadlines; expiry blocks output and the next ordinary
context refresh marks those references historical before another model step.
Historical reads do not create current-guidance dependencies.

Turas uses an exact CURRENT_SCHEMA_VERSION contract. Schema85 code and schema86
code are not interchangeable: coordinate a bounded maintenance window, verified
backup, migration/grants and code switch. Rehearse 85→86 with data and an isolated
restore before any hosted release. Do not apply86 to a serving85 deployment and
assume it remains compatible. Keep older shared public quality readable by deriving
its private deadline from original lineage; do not expose that deadline as shared
quality or change MCP v1's strict public DTO.

Review/deploy exact commit only after required CI, agent evaluation and authenticated
Preview checks. Verify Production separately after an authorized release. Prefer
forward repair. Reverting code alone against schema86 is unsafe; any rollback must
restore a matched code/schema recovery set under the existing recovery process.
After restore, reapply scripts/db-role-setup.sql through the existing db-roles
operator before reopening runtime access: owner default privileges otherwise grant
DELETE when tables are recreated, even if the dump records narrower explicit ACLs.
Deleted retired search copies must never be resurrected for withdrawn sources.
When Production is explicitly released on86, update the existing scheduled-backup
operator to matching source before its next capture, preserving its schedule,
resources, credential bindings and budgets. Its current85 deployment remains valid
for the unchanged Production85 database until that separate release.

The maintainer authorized merging this PR once CI is green. Actual-model guidance
orchestration and subsequent Production verification remain separate acceptance
work; do not claim FR-003/SC-002 or full release completion from CI. Automatic
Production deployment from main is disabled, so merge does not apply migration086.

## Complexity Tracking

No new service or orchestration layer. Automatic tool selection remains Turi's
existing agent orchestration; freshness exclusion, admission and paid-work bounds
are application-enforced. Actual-model behavior is a separate acceptance gate.
