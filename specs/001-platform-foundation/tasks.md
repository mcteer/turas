# Tasks: Turas platform foundation

Input: [spec](spec.md), [plan](plan.md), [research](research.md).
Checks prove repository setup and planning consistency; product feature tests belong
to their own specs. Checked items below reflect completed authored work, not merge.

## Phase 1: Setup

- [x] T001 Protect credentials/runtime outputs in `.gitignore` and establish the empty repository baseline.
- [x] T002 Install pinned Spec Kit assets in `.specify/` and `.agents/skills/`; create `specs/001-platform-foundation/spec.md`.

## Phase 2: Foundational rules

- [x] T003 Define project principles in `.specify/memory/constitution.md`.
- [x] T004 Preserve `agent/agent.ts` and replace test-only demo prose in `agent/instructions.md` with truthful foundation guidance.

## Phase 3: US1 — Consistent contribution workflow

Goal: contributors can follow setup and submit a consistent, validated PR.
Independent check: README setup and Spec Kit prerequisite resolution.

- [x] T005 [US1] Extend `AGENTS.md` with project boundaries while retaining eve framework requirements.
- [x] T006 [US1] Add `CONTRIBUTING.md`, `.github/pull_request_template.md`, `.editorconfig`, `.node-version` and `.env.example`.
- [x] T007 [US1] Add `scripts/check-docs.mjs`, package check commands and `.github/workflows/ci.yml`.
- [x] T008 [US1] Replace `README.md` with accurate setup, status, navigation and maintenance guidance.

## Phase 4: US2 — Complete ordered plan

Goal: all requested features have scope, dependencies and review gates.
Independent check: TR-01–TR-15 map to roadmap slices; templates/rubric are defined.

- [x] T009 [US2] Write `docs/product-blueprint.md` and `ROADMAP.md` with coverage and exit criteria.
- [x] T010 [US2] Write `docs/architecture.md`, `docs/evidence-policy.md` and `docs/decisions.md`.
- [x] T011 [US2] Define the five product content contracts in `docs/templates/`.
- [x] T012 [US2] Complete foundation `plan.md`, `research.md`, `data-model.md`, `contracts/README.md` and `quickstart.md`.

## Phase 5: US3 — Deliberate reference reuse

Goal: preserve useful behavior and design without demo data/unused integrations.
Independent check: audit maps source paths to feature slices and names gaps.

- [x] T013 [US3] Review demo behavior/data/UI/test source and record dispositions in `docs/legacy-review.md`.
- [x] T014 [US3] Record visual continuity and CLI WebKit validation in `docs/design-reference.md`.

## Phase 6: Verification and handoff

- [x] T015 Run `quickstart.md` checks on Node 24, inspect staged paths and record results in `validation.md`.
- [x] T016 Check requirements and cross-artifact consistency in `checklists/requirements.md` and `analysis.md`.
- [x] T017 Submit the foundation PR using `.github/pull_request_template.md` and record its URL in `validation.md`.

## Dependencies and implementation strategy

T001–T004 precede contribution and planning work. US1 and US3 research can proceed
independently; US2 incorporates that research and fixes the feature boundaries.
T015–T017 follow all authored artifacts. US1 alone establishes a usable contribution
baseline, while the full foundation includes US2/US3 before review.

Possible independent work: T005/T006 after T003; T013/T014 after T002; template drafting
after T009 can proceed alongside architecture documentation. These are dependency
notes, not automatic authorization to launch coding agents or start future features.

Maintainer review, merge, README verification and feature 002 are the next stage,
not incomplete implementation tasks hidden in this foundation PR.
