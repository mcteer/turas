# 013 Planning Handoff

Date: 2026-10-09. Work remains in `/Users/mcteer/Projects/turas`, branch `013-partner-enablement`, based on merged 012 at `2b93b225a9a2a12f9c7af3b423613d728afafb91`. No sibling worktree, runtime edit, schema change, hosted action or model call was made during planning.

## Resume implementation after the model switch

```sh
export SPECIFY_FEATURE_DIRECTORY=specs/013-partner-enablement
```

Invoke `$speckit-implement`. Read [spec](spec.md), [plan](plan.md), [tasks](tasks.md) and the three [contracts](contracts/) first. There are 48 unchecked tasks: 9 setup/foundation, 7 US1, 11 US2, 11 US3 and 10 acceptance/handoff. All 22 functional requirements and 7 buildable success criteria have task mappings. The workspace story is the MVP validation checkpoint; full completion includes all three stories and acceptance gates.

## Clarification and boundaries

One question was asked and answered: mcteer verifies partner checkpoint submissions. Canonical active internal administrator mcteer also governs new guide publication/retirement and learning assignments; existing plan, execution, grant and shared-publication authorities are preserved. Guide/attempt prose never approves customer facts, certifies skills or accepts delivery work. New guides are customer/engagement scoped; shared reuse continues through 005.

Clarification coverage: reviewer decision rights resolved; scope, domain model, interaction, nonfunctional requirements, integrations/dependencies, failure paths, constraints, terminology and completion signals clear. No unresolved product question or deferred implementation-critical decision. Federation and adaptive learning are explicit exclusions, not missing 013 requirements. The specification checklist remains 16/16 passing, with no newly passing items, regressions or unchecked items after clarification; its initial notes are retained unchanged.

## Implementation cautions

- Reuse existing partner delivery operations and sanitized shared knowledge; do not create a second plan engine/catalog.
- Preserve member-specific grants, same-org submission privacy, current source closure and synchronous withholding with workers stopped. Epoch/revision bindings prevent reactivation from reviving old assignments.
- Apply explicit 050/051 migrations and manifest hashes during implementation in owned local fixtures; if main's migration head changes, resolve numbering before authoring without altering applied migrations.
- Request status/resolve must share the admission lock. Explicit abandonment fences late originals after a lost response; browser storage holds no prose.
- Use owned synthetic environments and CLI WebKit. The planned scripts in [quickstart](quickstart.md) do not exist until implemented; their absence is not a reason to skip acceptance or point them at Production.
- Preserve agent model, selected database, `.env.local`, `.eve/.workflow-data` and unrelated files. No new live model evaluation is required unless agent behavior changes, which is outside this plan.
- Update `docs/partner-operations.md` during implementation with migration, disable and forward-recovery details. Do not deploy, migrate hosted data, send external messages or merge this planning branch under the prior 012 merge instruction.

The final read-only analysis is reported in the conversation. This file records design/handoff facts, not implementation or hosted acceptance.
