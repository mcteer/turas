# Tasks: Legacy chat interaction parity

## Setup and foundation
- [X] T001 Pin legacy behavior, current gaps and policies in research.md and spec.md (FR-001,FR-006).
- [X] T002 Define presentation state, interaction contracts and isolated verification in plan.md, data-model.md, contracts/chat-interaction.md and quickstart.md (FR-001,FR-006,FR-007).

## US1 — Compose and continue naturally
Independent test: keyboard, picker/paste/drop, URL removal, steering/Stop and question responses preserve one send and a fresh draft.
- [X] T003 [US1] Restore shared picker/paste/drop intake and link controls in app/_components/attachments/ordinary-documents.tsx and chat composer consumers (FR-002,FR-003).
- [X] T004 [US1] Guard concurrent preparation/send and terminal/newer-operation notices in app/_components/agent-chat.tsx; preserve exact decision responses and current styling (FR-002,FR-006).
- [X] T005 [US1] Add focused composer/state regressions in tests/ui/chat-interaction-parity.spec.ts (FR-002,FR-003,FR-007).

## US2 — Follow responses and inspect work
Independent test: live/retained content, delayed layout, scroll escape/restoration and activity/question transitions.
- [X] T006 [US2] Implement viewport follow/restore/latest control in app/_components/chat-viewport.tsx and integrate with active chat (FR-004).
- [X] T007 [US2] Restore native activity rendering alongside canonical prose in app/_components/chat-activity.tsx, lib/conversations/active-chat-history.ts and app/_components/agent-chat.tsx; distinguish progress/error/waiting states (FR-005,FR-006).
- [X] T008 [US2] Add display-helper unit and four-project viewport/activity regression tests in tests/unit/active-chat-history.test.ts and tests/ui/chat-interaction-parity.spec.ts (FR-004,FR-005,FR-007).

## US3 — Preserve design and release
Independent test: existing look, privacy/source fences, interrupted recovery, exact hosted read paths.
- [X] T009 [US3] Add isolated headless check runner scripts/check-chat-interaction-ui.ts and include relevant existing history/question regressions; inspect captures (FR-006,FR-007).
- [X] T010 [US3] Run typecheck, docs/build and independent implementation review; update README.md, ROADMAP.md and validation.md with actual scope/results (FR-001,FR-006,FR-007).
- [X] T011 [US3] Verify exact authenticated Preview, green CI, merge/cleanup and deployed Production behavior; record results in validation.md (FR-007).

## Dependencies and implementation strategy
T001–T002 precede code. T003–T005 cover US1; T006–T008 cover US2. Both are required before T009–T011 release. Viewport and attachment modules may be developed independently, but integrate agent-chat sequentially to avoid edit conflicts. Validate each mechanism before broad release gates; all three stories are required, no partial MVP release.

## Profile and conversation follow-up — 2026-10-18

- [X] T012 Restore searchable customer selection with keyboard/focus handling and draft preservation; migrate existing customer-selection UI fixtures.
- [X] T013 Refresh the authorized recent-conversation list on creation, native messages and route changes, with content-free invalidation events.
- [X] T014 Include complete checked claims from selected eligible research sources in profile and inventory products; preserve excerpt/source bounds, capability/community exclusions and legacy source precedence.
- [ ] T015 Verify final focused domains, built four-project WebKit, typecheck and documentation; record results and hosted limits.
- [ ] T016 Complete reviewed PR, exact authenticated Preview/Production acceptance and merged-branch cleanup before claiming release.
