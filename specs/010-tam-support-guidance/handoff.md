# 010 Planning Handoff

**Draft directory**: `/Users/mcteer/.opencode/plan/010-tam-support-guidance/`
**Intended repository directory**: `specs/010-tam-support-guidance/`
**Intended branch**: `010-tam-support-guidance`

## Planning Status

Specification, one answered authority clarification, technical research/design, contracts and dependency-ordered tasks are staged here. The requested analysis is a read-only review reported in the conversation; it does not modify the artifacts. These drafts are not yet a repository feature selection or a created branch.

The confirmed policy is mcteer-only approval, with panel proposing. Explicit defaults: partners read accepted delivery guidance for assigned customers, guidance is on demand, and external ticket references are human-reported without integration. Refer to [spec.md](spec.md) and [tasks.md](tasks.md) for full scope.

## Build-Agent Start

1. Inspect `git status` and branch/worktree state. Current main has unrelated Spec Kit changes and unfinished reporting cleanup/tests, including README and migration-manifest edits. Preserve them; a clean feature worktree based on committed main is the preferred implementation base.
2. Verify no 010 branch/spec exists, create the feature branch explicitly and copy only this planning directory into the intended repository path. Recheck current main migration version before using provisional migration numbers 042/043.
3. Set `SPECIFY_FEATURE_DIRECTORY=specs/010-tam-support-guidance`. The feature pointer is ignored local state, independent of Git. Run the checked-in prerequisite/doc/analyze workflow on the actual repository copies before implementation; normal helpers may update the local pointer in Build mode.
4. Re-read AGENTS, constitution and the feature docs, then execute `speckit-implement` against [tasks.md](tasks.md). Keep all tasks unchecked until their behavior/check is evidenced.
5. Create `validation.md` during implementation and follow [quickstart.md](quickstart.md). Preserve the root model and all unrelated work. Record any blockers rather than substituting mocks for actual-model or hosted evidence.

## What Was and Was Not Run

- Checked-in Spec Kit skill instructions and local active templates were read; there are no extension hooks, presets or template overrides in this checkout.
- Read-only discovery covered roadmap/blueprint, governance, evidence/design policies and current profile/retrieval/execution/native source seams plus relevant installed Eve/Next docs.
- Clarification: one question asked and answered; the answer is integrated into spec, roles, model and tasks.
- Pure path prerequisite resolution ran with this external directory using `bash`; its reported branch name is synthesized and does not create/switch Git branches.
- Repository-mutating setup helpers and `.specify/feature.json` persistence were not run in Plan mode. Artifacts were authored only within the permitted plan directory.
- Planning validation consists of Markdown/link/placeholder/task-format/coverage checks and cross-artifact analysis. Feature code, migrations, runtime/browser/load/recovery/live-output tests are implementation work, not completed planning evidence.

## Integration Boundaries

005 and 008 are functional prerequisites; their governed sources and lifecycle patterns are already present. 009 merged in PR17 after green CI. The README/ROADMAP have older status language and the working tree contains later reporting follow-up work; use committed-state evidence when documenting dependencies. Real Resend acceptance remains deferred/default-off and does not block 010 development.

No ticket system, notification connector, automatic escalation, recurring generation, partner enablement curriculum, commercial expansion, product-gap registry, adaptive learning or MCP endpoint is included. No provisioning, deployment or selected database migration is authorized by this planning handoff.
