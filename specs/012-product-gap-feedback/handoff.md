# 012 Implementation Handoff

**Date**: 2026-10-08
**Branch**: `012-product-gap-feedback`
**Checkout**: `/Users/mcteer/Projects/turas`
**Base**: merged 011 on main, `b5d54276c9e46630b3dd9401c573d5788d9337cd`
**Scope**: Specify → clarify → plan → tasks → read-only analyze, then stop for the requested model switch. No implementation has started.

## Resume in the canonical checkout

```sh
cd /Users/mcteer/Projects/turas
export PATH=/opt/homebrew/opt/node@24/bin:$PATH
export SPECIFY_FEATURE_DIRECTORY=specs/012-product-gap-feedback
```

Read root `AGENTS.md`, `README.md`, `CONTRIBUTING.md`, the constitution and the [spec](spec.md), [plan](plan.md), [tasks](tasks.md), [data model](data-model.md), [contracts](contracts/domain.md) and [quickstart](quickstart.md). Run `$speckit-implement` only when the user starts implementation with the chosen model. Do not create another checkout/worktree, import legacy data, change the selected database/workflow data or relink/deploy the project during setup.

## Settled decisions

- One clarification answered: active internal members propose; only canonical active internal administrator mcteer approves/reclassifies gaps and impact, confirms merge/split, approves customer disclosure and records handoff. Account ownership/stewardship/another administrator is not an override.
- Four stories: capture/review; canonicalization and counts; deterministic engineering reports; manual handoff/follow-up.
- Original evidence and current access govern every read/count/review/export. Confirmed impact needs accepted customer need and current direct product evidence. Public attribution remains suspected.
- Merge/split explicitly preserves each observation once; customer sets use canonical customer identity, with separate confirmed, suspected-only and resolved-history categories.
- Existing template sections are mandatory. Reports are in-app plus private Markdown/JSON, reviewed for exact audience and every included customer. Handoffs are human-reported; no external send/fetch or automatic customer resolution.
- Reuse the existing reports-worker process and low-level private store through 012-specific policy. No new agent/model behavior, provider, renderer, dependency or paid evaluation is planned. Preserve `agent/agent.ts`.

## Task readiness and acceptance

There are 52 unchecked tasks: 3 setup, 6 foundation, 9 US1, 7 US2, 11 US3, 4 US4 and 12 cross-cutting. Six `[P]` test-authoring tasks form three independent pairs; shared contracts/fixtures/manifests stay sequential. US1 is the first complete local demonstration, but all four stories and cross-cutting gates are required for completion.

The [requirements checklist](checklists/requirements.md) passes 16/16. All 22 functional requirements and seven buildable success criteria map to tasks. C01–C16 are quoted verbatim at their implementation points. The [quickstart](quickstart.md) defines 15 initial automated suites and six browser journeys in each of four WebKit projects, plus exact load and recovery corpora; these are planned checks, not executed runtime evidence.

Planning documentation checks are recorded in [validation.md](validation.md). The final read-only analysis is reported in the planning conversation; it does not silently alter the artifacts. Implementation must read that result before starting. Any subsequent source/contract change requires corresponding tasks/check updates.

## Workspace and release boundaries

011 merged with all 16 CI jobs and eight independently reviewed actual-model cases accepted. Its branches and redundant worktrees were removed. Read-only legacy remains `../turas-back`; recovery archives are outside Projects. Preserve the canonical `.env.local` and `.eve/.workflow-data`; synthetic runners must sanitize inherited configuration and own/clean their disposable resources.

012 migrations 048–049 are provisional until implementation rechecks the manifest. Planning has not installed them, run Docker/databases/browsers/model calls, modified runtime code or certified hosted behavior. Implementation local acceptance, CI, Preview and Production must be recorded separately. A future implementation PR should include actual checks and forward recovery; merge/deploy need applicable user authorization. Stop here for the model switch.
