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

## Implementation boundaries

- Keep `.env.local`, `.eve`, credentials, private artifacts, and customer data out
  of commits and tool output. Use `.env.example` for documented variable names.
- Preserve `agent/agent.ts` model selection unless explicitly asked to change it.
- For feature 002, root `npm run dev` supervises the local Next.js app, eve and
  the Postgres maintenance worker. Preserve both the selected database and
  `.eve/.workflow-data` across restart/recovery checks. The repo is disconnected
  from Vercel; do not link, reconnect or deploy during this slice.
- `mcteer` and `panel` are temporary internal logins that can read every workspace
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
