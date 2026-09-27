# Implementation Plan: Turas platform foundation

**Branch**: `001-platform-foundation` | **Date**: 2026-09-26 | **Spec**: [spec.md](spec.md)

## Summary

Install pinned official Spec Kit tooling, review the demo, define the platform and
its delivery sequence, establish contribution rules and artifact contracts, and
validate the foundation for its first PR. Implement no customer-facing feature.

## Technical Context

- Language/runtime: existing TypeScript scaffold, Node 24, npm lockfile.
- Dependencies: preserve eve 0.67.1 and the selected model; Spec Kit 1.0.12 from the
  official release at commit `e77daa9021d20db26b878f7dfa5640fe5a42d04e`.
- Storage: Markdown/JSON configuration only; no database or artifact store provisioned.
- Testing: documentation links/hygiene, Spec Kit artifact resolution, TypeScript and
  eve compile without sandbox preparation. No live model calls required.
- Platform: local macOS authoring; Linux GitHub Actions checks. UI implementation
  will use Next.js/eve and CLI Playwright/WebKit after 001.
- Constraints: preserve secrets/model, no speculative integrations, no harness
  authorship credits, no deployment, and explicit distinction between planned and built.
- Scale/performance: not applicable to documentation setup; future feature plans set budgets.

## Constitution Check

| Principle | Before design | After design |
| --- | --- | --- |
| Spec-driven increments | Bounded foundation | Spec/plan/tasks and roadmap with per-slice gates |
| Customer outcomes | Required | Maturity separated from delivery/product spend |
| Evidence lifecycle | Required | Explicit manual acceptance and scored research policy |
| Authorization | Required | Shared domain boundaries; partners present from 002 |
| Human decisions | Required | Versioned acceptance and send contracts |
| eve core | Preserved | Model unchanged; zero new integrations |
| Meaningful verification | Required | Docs/typecheck/compile and CI; no fake UI claims |
| Operability | Planned | Failure, lineage, idempotency and recovery required by downstream specs |

No exceptions. Proposed constitution adoption remains part of foundation review.

## Project Structure

```text
.agents/skills/                # Official Spec Kit integration assets
.specify/                     # Templates, scripts, manifests, constitution and license
.github/                      # PR template and foundation checks
agent/                        # Existing eve scaffold, concise purpose/instructions
docs/                         # Blueprint, architecture, policy, decisions, reference audit
docs/templates/               # Five versioned product artifact content contracts
specs/001-platform-foundation/ # Spec, plan, research, conceptual model, tasks and validation
scripts/check-docs.mjs         # Authored-doc link and tracked-path checks
AGENTS.md
CONTRIBUTING.md
README.md
ROADMAP.md
```

## Work and delivery sequence

1. Protect local files, establish an empty Git baseline, initialize official Spec Kit
   and create branch/spec 001 using its templates and scripts.
2. Review old authored instructions/skills/specialists, domain/data modules, UI and
   test scenarios; research current eve topology and Vercel products only as needed.
3. Write constitution, contribution guide, product blueprint, architecture, evidence
   rubric, decisions, roadmap, reference audit, templates and concise root instructions.
4. Add reproducible checks and CI, verify artifacts and secret exclusions, inspect
   requirement coverage, and prepare a PR following the prescribed template.
5. After maintainer review/merge, verify README and begin specification 002. Its open
   choices are tracked in `docs/decisions.md`; they are outside 001's implementation scope.

## Rollout and rollback

Publish this branch for review; no deployment or database change occurs. Revert the
foundation commit to undo repository configuration. The locally installed Specify
CLI is independent of the app and can be removed with `uv tool uninstall specify-cli`
if desired. The old demo and existing secrets remain untouched. Normal eve full-build
prewarming requires infrastructure; compile-only output must not be deployed.

## Complexity Tracking

No additional runtime framework, integration, database, or agent specialist is added.
Upstream Spec Kit assets remain intact; project policy lives in authored documents.
