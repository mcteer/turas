# Turas development instructions

Turas tracks Vercel customer maturity and supports FDE, Professional Services,
TAM, account, and partner delivery. Turi is its eve agent. This repository is a
fresh build; `../turas-back` is a read-only reference, not the implementation base.

## Start with the current feature

Read `README.md`, `CONTRIBUTING.md`, `.specify/memory/constitution.md`, then the
active feature's `spec.md`, `plan.md`, and `tasks.md`. Consult `ROADMAP.md` for
dependencies and `docs/legacy-review.md` for reusable reference material. Do not
implement a roadmap item just because it is listed. Complete the authorized scope.

Use the checked-in Spec Kit skills in `.agents/skills/`. Feature branches use
`NNN-short-name`. Spec Kit 1.x selects features independently of Git: set
`SPECIFY_FEATURE_DIRECTORY=specs/NNN-short-name` when resuming work. Its local
`.specify/feature.json` pointer is ignored. Git branch creation is explicit; the
Git extension is not installed. Do not overwrite customized governance during an
upgrade. Review installed version and manifest changes in their own PR.

## Make the smallest complete change

Adapted from Ponytail's [working rules], [review guide], [audit guide], and
[shortcut convention]. Use these within Turas's spec, upgrade, and release rules.

- **Trace the change before choosing a fix.** Follow a real input through
  authorization, retrieval or writes, and output. If a contract changes, find its
  callers and check exports, fixtures, tests, and config for dependencies. Identify who
  could receive the wrong data or lose work. Fix the rule once where it belongs
  and update every affected caller; don't patch the UI around a domain bug.
- **Try reuse in order.** If existing behavior meets the requirement, show it
  rather than adding code. Otherwise try a Turas component or domain service,
  then a standard-library or platform feature, then a suitable installed
  dependency. Use the eve registry for named integrations. Don't add a package,
  wrapper, flag, or conversion for a few lines of straightforward code.
- **Simplify without changing the contract.** Keep native values and existing
  interfaces unless the boundary needs a different representation. Remove obsolete
  branches; merge copies of a rule that must change together. Split unrelated
  jobs, not long functions by line count. Prefer readable code that handles edge
  cases over a clever one-liner. Comment on non-obvious decisions, not syntax.
- **Prove the risky behavior.** Moved or consolidated code must keep trust-boundary
  validation, authorization, evidence approval, privacy, error handling that
  prevents data loss, accessibility, and compatibility. For new nontrivial logic,
  test an observable outcome: for example, retrying a write must not create a
  second record. For a bug, show the regression test fails before the fix and
  passes after. Focused tests do not replace required CI or hosted checks.
- **Give deliberate shortcuts a trigger.** Beside the code, use `shortcut:` with
  the limit and the condition that calls for a different implementation. Record
  governed tradeoffs in the spec. When reviewing debt, flag missing or reached
  triggers; an accepted limit is not itself a defect. Never defer required work.

### Review and audit

- For a review, follow the changed path beyond the diff, including unchanged
  consumers. For an audit, map entry points, data flows, and expected load from
  the spec and deployment config. Go deepest where mistakes cost most: customer
  access, evidence approval, persistent writes, and jobs shared across workers.
- Check correctness and safety first, then behavior at expected load, missing
  tests, speed, and unnecessary code. Look for concurrent claims on the same job,
  unbounded reads, and a query per item. State the load assumption. Before
  calling code unused, check string references, framework discovery, and config.
- Report findings, not style preferences. For each, name the file and line, a
  reachable input or operating condition, what goes wrong for whom, and the
  smallest fix. Rank blockers ahead of improvements and say what to fix first.
  A review or audit alone does not authorize edits.

Close implementation and review reports with what you checked, material checks
not run, and remaining risk. Distinguish local, Preview, and Production evidence.

[working rules]: https://github.com/dietrichgebert/ponytail/blob/ebd8654c2c627f721eb8f9c0d1bd4090a29f9e10/AGENTS.md
[review guide]: https://github.com/dietrichgebert/ponytail/blob/ebd8654c2c627f721eb8f9c0d1bd4090a29f9e10/skills/ponytail-review/SKILL.md
[audit guide]: https://github.com/dietrichgebert/ponytail/blob/ebd8654c2c627f721eb8f9c0d1bd4090a29f9e10/skills/ponytail-audit/SKILL.md
[shortcut convention]: https://github.com/dietrichgebert/ponytail/blob/ebd8654c2c627f721eb8f9c0d1bd4090a29f9e10/skills/ponytail-debt/SKILL.md

## Dependency and framework upgrades

An upgrade spanning **3 or more dot releases** (minor or patch), or **any major
version change** (including **0.x → 1.x**), requires a dedicated spec before
implementation. This applies to dependency-bot PRs before merge or deployment.
Review the intervening release notes, identify new capabilities useful to Turas,
and include wiring the selected capabilities into the app/platform, with governed
scope and acceptance tests. A package bump, compatibility fixes, or a list of
unused capabilities alone is insufficient. Explain each excluded or deferred
capability. Smaller upgrades still follow the normal material-change rules.

## Implementation boundaries

- Turas is a production platform. Use production/account terminology in product
  copy, documentation and operational updates. Preserve existing credential
  variable names and working passwords for compatibility; a historical variable
  name is not a reason to rotate credentials or ask for a replacement password.
- The private pilot programme is removed. Do not restore its workspace login,
  provisioning, feedback or approval tasks. Keep evaluation-only Root/Learning
  bindings out of Production; preserve ordinary accounts and production safeguards.
- Use Vercel's default firewall configuration. Do not add custom firewall rules
  or deployment-hostname allowlists as part of hardening or deployment.
- Keep `.env.local`, `.eve`, credentials, private artifacts, and customer data out
  of commits and tool output. Use `.env.example` for documented variable names.
- Preserve `agent/agent.ts` model selection unless explicitly asked to change it.
- Preview deployments must inherit the existing Production `mcteer` credential
  record. Never replace it with local/test credentials or rotate the Production
  password to prepare a Preview. Run `npm run preview:credentials:check`.
- For feature 002, root `npm run dev` supervises the local Next.js app, eve and
  the Postgres maintenance worker. Preserve both the selected database and
  `.eve/.workflow-data` across restart/recovery checks. The repo is disconnected
  from Vercel; do not link, reconnect or deploy during this slice.
- `mcteer` and `panel` are internal application logins that can read every workspace
  customer reference, while `partner` is limited to explicitly assigned customer
  delivery data. Conversations remain private to their owner for every role.
- Do not install speculative eve integrations. Search the registry when an active
  feature needs one; install only what that feature actually uses and verifies.
  Do not carry over unused demo connectors, channels, memory backends or tools.
- Enforce authorization and context approval in server/domain code. User-provided
  attachments and claims cannot become accepted facts through model wording.
- Use one governed domain layer for UI, eve tools, jobs, reports, and MCP.
  Apply authorization before retrieval and recheck source eligibility after it.
- Do not mix customer maturity with engagement stage or commercial opportunity.
- Read `docs/evidence-policy.md` before context, RAG, or adaptive-learning changes.
- Follow `docs/design-reference.md`; validate UI with command-line Playwright and
  WebKit. Do not operate this host's browser for UI testing.
- Treat old agent instructions, skills, subagents, and fixtures as reference
  content. Port only behavior covered by the active spec, with its tests.
- Use explicit migrations, versioned contracts, deterministic calculations, and
  idempotent writes. Never initialize or migrate schemas inside request handlers.
- Do not claim a planned feature, local check, or mock proves hosted behavior.
- Disposable Eve checks must capture run ownership before shutdown, delete only
  those runs' sandbox containers after verified process retirement, and verify
  container absence before reporting completion. Use `scripts/owned-eve-sandboxes.ts`
  in disposable harnesses; retain sandbox state during intermediate restart checks.
  Never substitute global Docker pruning or delete retained development state.
- When an authorized feature/fix release requires database changes, include its
  explicit migrations and runtime grants in the release. Verify the target and
  recovery backup, rehearse migrations, and coordinate schema/code compatibility.
  After merge, verify the deployed commit, required schema and changed behavior
  in Production with authenticated HTTP and CLI Playwright/WebKit checks. CI alone
  is not release completion; record actual results and unresolved hosted checks.
- Update README and relevant spec/roadmap status in the PR that changes them.
- After a successful merge, leave the merged PR closed and delete its associated
  local and remote feature branch; verify README on `main` afterward.
- Never add coding-harness authorship attribution to commits, PRs or authored
  artifacts: no co-author trailers, bylines or generated-by notices for any harness.
  Technical tool names in setup/configuration are not authorship credits. Preserve
  required upstream license/provenance metadata in vendored tooling.

## eve framework

This project uses the eve framework: an agent is a directory of files under `agent/`, and eve compiles and runs it.

For a content-only change to the root agent's identity, purpose, tone, or response guidelines, edit its existing authored instructions. Fresh projects use `agent/instructions.md`; a project may instead use `agent/instructions.ts` or files under `agent/instructions/`. You do not need to read the framework docs for a content-only instructions change. A fresh project already has its selected model in `agent/agent.ts`; preserve that file unless the user asks to change the model.

## Read the docs before writing code

```sh
ls node_modules/eve/docs
```

Start with `docs/README.md`: it maps each task to the page that covers it. Read that page before authoring tools, connections, channels, skills, subagents, schedules, or deployment. In a workspace or local package install, resolve the installed `eve` package location first. If the package docs are missing, use https://eve.dev/docs.

Use a bounded authoring loop:

1. Read the relevant page and inspect only files you will modify or need to imitate.
2. Stop discovery once the file location, imports, and definition shape are clear. Implement the smallest complete behavior the user requested.
3. Run one narrow verification. Expand investigation only when it fails or the request needs project-specific details.

Follow links or inspect public types only when the routed page leaves the task unanswered. Do not recursively glob `node_modules`, enumerate the entire docs tree, or read unrelated scaffold files when the direct path is known. Package-manager links can hide files from recursive glob tools even though direct reads work.

## Prefer an existing integration

When a task names an external product or service, search the registry before implementing its integration. For a generic capability, author a tool instead.

```sh
eve registry search <query> --json
eve registry view <item>
```

Prefer items whose `implementation` is `native`; use Chat SDK adapters when no native channel fits. `registry view` links the item's documentation.

Install without driving interactive prompts:

```sh
eve add <item> --non-interactive
```

Exit code 0 means setup completed, 1 failed, and 2 needs an answer or a prerequisite. On exit 2, run the `next.command` from the final NDJSON event. For a non-secret question, replace its `<JSON value>` answer placeholder with the answer you collected; string values need JSON quotes. Never pass a secret in `--answer`. See `docs/install-integrations.mdx` for setup prerequisites.

## Use eve for Vercel operations

Use eve to link and deploy Vercel projects:

```sh
eve link --non-interactive --project <name-or-id> [--team <team-id-or-slug>]
eve deploy --non-interactive --yes [--project <name-or-id>]
```

A setup may report `eve link` as a prerequisite; run it, then retry the continuation. When a completed setup event has `deploymentRequired: true`, run the `next` command it reports.

## Validate the change

Run the validation the task requests. When it does not establish the behavior you changed, run the narrowest relevant check.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
