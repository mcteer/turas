# 014 Implementation Handoff

Date: 2026-10-09. Canonical checkout `/Users/mcteer/Projects/turas`, branch
`014-governed-adaptive-learning`, based on merged 013 at
`7a3e8947408d396b5ab0867e6ec92648d1ea775b`. No sibling checkout was created.

## Resume after the model switch

```sh
export SPECIFY_FEATURE_DIRECTORY=specs/014-governed-adaptive-learning
```

Invoke `$speckit-implement`. Read [spec](spec.md), [plan](plan.md),
[tasks](tasks.md), [data model](data-model.md) and all four [contracts](contracts/).
The original plan contains 66 tasks: 3 setup, 7 foundation, 12 US1, 12 US2, 10 US3,
7 US4 and 15 acceptance/release. All 26 functional requirements and 7 buildable
success criteria have task mappings. US1 is the first MVP checkpoint; full completion
requires all four stories and the documented acceptance gates.
Implementation has since resumed. Only T062 (actual-model acceptance), T065
(reviewable PR) and conditional T066 (authorized hosted release) remain unchecked.
Consult [validation](validation.md) for current source-bound outcomes.

## Clarification and readiness

Two questions were asked and answered:

1. Cross-customer aggregate metrics are internal-only. Partners still receive
   reviewed sanitized practices, without customer counts or aggregate outcomes.
2. Turi drafts improvements and evaluates representative cases under an explicit
   budget; administrators review and publish.

Existing 005 internal-administrator publication authority and contribution-authoring
rights remain unchanged. New learning drafting, evaluation and review queues are
internal. Feedback does not authorize factual acceptance or shared reuse. Individual
shared practices do not need a five-customer cohort; statistics do.

Clarification taxonomy: scope, domain model, interactions, nonfunctional requirements,
integrations/dependencies, failure paths, constraints, terminology and completion
signals are clear; aggregate audience and automation scope are resolved. No deferred
implementation-critical question remains. Checklist: 16/16 before and after
clarification, zero changed checkboxes or regressions. Final read-only analysis is
reported in the conversation after all planning artifacts are complete.

## Implementation cautions

- Reuse immutable 005 revisions and the existing publication transaction. Gate every
  old/new publication route and an activation-aware database writer; preserve exact
  legacy published heads without invented evaluation passes.
- Fix withdrawal against the actual published head even when newer drafts exist.
  Rollback makes a new reviewed/evaluated revision, never resurrects old authority.
- USD budgeting in 011 is evaluation instrumentation. Build the new production
  reservation/settlement domain explicitly; do not run fixture DDL in handlers.
- Preserve the root model and native lifecycle. Fixed cases are isolated paired
  sessions; model output cannot choose tests, set pass flags or publish. Read the
  installed framework docs before extending hooks.
- Actual-model acceptance requires a **new explicit operator budget** and an
  independent review of all eight actual pairs. Prior 011 spend approval does not
  authorize 014 calls. Unknown cost/dispatch blocks further paid work; an evidence-
  backed conservative bound is distinct from actual cost.
- Fixed metric/quarter release families span protocol versions. Source or rights
  loss withholds the entire release; no corrected subset or count-bearing fallback.
- Run owned synthetic fixtures beneath `local-artifacts/014/` in this checkout.
  Preserve `.env.local`, selected database, `.eve/.workflow-data` and unrelated work.
  Generic disposable runners must never target Production.
- Planned migrations are 052–054, after the current 051 head. Recheck numbering on
  main; preserve existing migration hashes. Explicit runtime grants and activation
  are part of release readiness, not optional follow-up work.
- T066 is post-merge release acceptance and stays pending until authorized merge and
  actual Production checks. Do not claim all hosted acceptance while it is pending.
  Update its record through the ordinary reviewed documentation follow-up if needed
  after the merged feature branch has been deleted.

## Separate Production repair performed during planning

The user reported Product Gaps failing in Production. The deployed 013 code was on
schema 045. A private backup/restore rehearsal preserved original rows across 294
tables; explicit 046–051 migrations and runtime grants were then applied. Internal
HTTP and CLI WebKit checks passed for Product Gaps and Partner Delivery. Local
partner credentials were rejected, so hosted partner-role acceptance remains
unverified. See [recovery](../../docs/production-recovery-2026-10-09.md).

This was an authorized repair of already merged features, not 014 implementation.
No 014 runtime, migration or model call was made. Release instructions now require
required database changes and actual post-merge Production verification. Keep those
changes in the next reviewed documentation/feature PR; do not lose them at model switch.

## Implementation preflight

Implementation resumed in this canonical checkout on 2026-10-09. Feature selection
is `specs/014-governed-adaptive-learning`; Git branch remains
`014-governed-adaptive-learning`, based on main's schema 051. Installed Next route
and client/server guides and eve context/lifecycle routing were read before edits.
No sibling checkout, hosted release or root model change was made. The owned
fixture runner checks root environment/model identity before and after cleanup and
uses its own copied workflow runtime. See [validation](validation.md) for narrow
checks already completed; the full implementation and acceptance gates remain open.

## Current acceptance handoff

The $25 actual-model budget and a separate independent output review agent are
explicitly authorized for 014. Do not reuse 011 authorization or start a paid retry.
The capture runner and verifier are implemented and its sixteen-arm synthetic
runner check passed. The complete domain/native manifest passes 75 checks in
18 suites. Production remains schema 051; no 014 hosted acceptance is claimed.
Read [operations](../../docs/learning-operations.md) before a separately authorized
release. Source loss retention uses original lifecycle event times and preserves
earlier captured deadlines. All owned resources remain inside this checkout.
