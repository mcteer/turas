# Turas engineering guide

Turas is Vercel's internal customer-delivery command center. Turi is the Eve-based assistant within the application. This repository is a production-oriented Next.js and TypeScript application deployed on Vercel.

Treat this file as the working agreement for all changes. Prefer the smallest change that reliably advances a user or customer-delivery outcome.

## Product and operating context

- Turas supports Vercel FDE and Professional Services work: customer maturity, delivery planning, engagement health, risk, decisions, and outcomes.
- It is an internal delivery-management system, not a generic integration browser or workspace administration tool.
- Customer value and safe operational use take precedence over technical novelty. Design for FDE/PS, account teams, delivery leaders, and business stakeholders—not only developers.
- Keep Turas terminology precise: **Turas** is the application, **Turi** is the assistant, and **FDE/PS** are Vercel teams.

## Technology baseline

- Next.js App Router, React, TypeScript, Tailwind CSS, and Zod.
- Eve supplies the assistant runtime. Root instructions live in `agent/instructions.md`; procedural skills live in `agent/skills/<skill-name>/SKILL.md`; custom tools live in `agent/tools/`; external connections live in `agent/connections/`.
- Vercel is the deployment platform. Use Vercel Preview Deployments for review and validation before production.
- The supported Node version is declared in `package.json`. Do not casually change it, the lockfile, framework versions, or generated configuration.

## Eve operating procedure

Eve compiles and runs the `agent/` directory. Treat the following locations as the supported extension points:

- `agent/instructions.md` — root identity, purpose, tone, and universal response rules.
- `agent/instructions.ts` or `agent/instructions/` — alternate instruction layouts, if the project uses them.
- `agent/agent.ts` — root agent configuration and selected model. Preserve the selected model unless a model change is explicitly requested.
- `agent/skills/<skill-name>/SKILL.md` — reusable procedural guidance for recurring workflows.
- `agent/tools/` — custom, callable capabilities.
- `agent/connections/` — authenticated external-system connections.
- `agent/channels/`, `agent/subagents/`, `agent/hooks/`, and `agent/memory/` — channels, delegated runtime behavior, lifecycle hooks, and memory configuration.

For a content-only change to Turi's identity, purpose, tone, or response guidance, edit the existing authored instructions. Do not alter `agent/agent.ts`, add a tool, or change a connection unless the requested behavior actually requires it.

Before authoring an Eve tool, connection, channel, skill, subagent, schedule, or deployment change, locate the installed framework documentation:

```sh
ls node_modules/eve/docs
```

Start with `node_modules/eve/docs/README.md`, which routes to the relevant topic. Read that topic before implementation. If the local package documentation is unavailable, use the official [Eve documentation](https://eve.dev/docs).

Use a bounded authoring loop:

1. Read the relevant documentation and inspect only the files to be changed or deliberately imitated.
2. Stop discovery once the file location, imports, and definition shape are clear; then implement the smallest complete behavior requested.
3. Run one narrow verification. Expand investigation only if it fails or the task needs project-specific evidence.

Do not recursively enumerate `node_modules`, follow unrelated documentation paths, or inspect public types unless the routed documentation leaves a material question unanswered. Package-manager links can conceal files from recursive searches even when their direct paths are valid.

### Integrations and registry

When adding an external service, search the Eve registry before building a custom integration:

```sh
eve registry search <query> --json
eve registry view <item>
```

Prefer registry entries with a `native` implementation. Use a Chat SDK adapter only if no native channel meets the need. The registry entry is the source for integration-specific documentation.

Install a selected integration non-interactively:

```sh
eve add <item> --non-interactive
```

An exit code of `0` means setup completed; `1` means it failed; `2` means setup needs an answer or prerequisite. For code `2`, run the reported `next.command` after supplying only the required non-secret answer. Never pass a secret through an `--answer` argument; follow `docs/install-integrations.mdx` for setup prerequisites.

### Vercel operations through Eve

Use Eve to link and deploy this project:

```sh
eve link --non-interactive --project <name-or-id> [--team <team-id-or-slug>]
eve deploy --non-interactive --yes [--project <name-or-id>]
```

If setup reports that `eve link` is required, complete it before repeating the blocked operation. When setup completes with `deploymentRequired: true`, run the reported next command. Do not deploy, link a project, or change a Vercel environment without explicit authorization for that external state change.

## Before changing code

1. Read the nearest relevant files and existing patterns before proposing an implementation. Check `package.json`, the target route/component/tool, and any local instructions that govern that area.
2. For an Eve change, follow the Eve operating procedure above and read only the documentation page for the type of change being made.
3. Confirm the source of truth for every customer, engagement, and operational-data claim. Do not invent account records, IDs, health states, delivery milestones, or product usage.
4. State a short implementation plan when the change affects data, authentication, external systems, the assistant's behavior, or user-visible workflows. For a focused bug fix, proceed directly after inspection.
5. Reuse an established internal pattern or supported integration before adding a dependency, a custom protocol client, or another abstraction.

## Implementation standards

- Make focused, reversible changes. Avoid opportunistic refactors, broad formatting churn, and unrelated dependency upgrades.
- Use TypeScript strictly. Do not introduce `any`, unchecked type assertions, or error suppression to make a build pass. Narrow `unknown` values with runtime validation.
- Validate all external input at the boundary with Zod or an equivalent explicit schema. Validate tool inputs and structured tool outputs.
- Keep server-only logic, credentials, authorization checks, and data access out of client components and browser bundles.
- Use clear domain names: `customerAccount`, `engagement`, `maturityStage`, `deliveryPlan`, `risk`, and `decision`. Avoid generic names such as `data`, `result`, or `handler` when a domain term is available.
- Prefer small, composable functions with one responsibility. Keep business rules separate from rendering and transport code.
- Handle expected failures intentionally: use useful error messages, preserve the underlying cause in logs where safe, and provide a usable recovery action.
- Preserve backward compatibility for persisted records, tool contracts, URLs, and public interfaces unless the change includes an explicit migration and rollback plan.

## Customer-account and connector safety

Customer-delivery intent always takes precedence over a same-named provider, connector, MCP server, skill, extension, or integration.

- For questions about an organization as a Vercel customer—status, engagement, maturity, delivery, risk, health, outcomes, capacity, or Vercel-product use—resolve it as a customer account first.
- Treat a name as an integration provider only when the user explicitly asks to connect, authorize, link, configure, install, manage, troubleshoot, or inspect that provider or its integration.
- Never prompt to connect a provider merely because its name matches a Vercel customer. For customer-delivery questions, load the relevant customer and engagement context first.
- A customer-account resolver must query an approved source of truth (for example, a CRM, governed operational database, or approved Coda account table). Do not ship a resolver that relies on guessed records, a static demo list presented as production data, or an undeclared import.
- Design downstream delivery tools to accept a canonical `accountId`, not an unqualified customer name. On zero or multiple matches, return a clear not-found or selection state rather than guessing.
- Treat account data, engagement notes, health signals, and roadmap information as sensitive internal information. Retrieve and expose only what is needed for the stated decision.

## Eve tools, skills, and connections

- Change `agent/instructions.md` for Turi's identity, scope, tone, and universal operating principles. Keep it policy-oriented rather than duplicating long procedures.
- Add or update a skill when a recurring workflow needs dedicated sequencing, definitions, decision rights, evidence requirements, or output expectations. A skill should be specific enough to route correctly and concise enough to follow reliably.
- Add a custom tool only when it has a real capability backed by a supported service or a maintained internal module. A tool filename becomes part of Turi's callable surface; name and describe it precisely. Do not import an application layer that the repository does not contain.
- Tools must have bounded inputs, explicit authorization behavior, cancellation handling where supported, schemas for inputs and outputs, deterministic failure states, and no hidden side effects.
- Read tools are preferred. Any action that changes external data, access, configuration, or customer-facing state must make its effect explicit and require the appropriate user confirmation or approval path.
- Keep connector access least-privileged and environment-scoped. Use Vercel Connect for delegated, runtime access to external systems; do not describe or use it as a general secrets-management substitute.
- Do not grant a Preview Deployment production credentials, unrestricted production write access, or live customer data unless that exposure is explicitly approved and necessary.
- Do not rely on the default connector-search behavior for customer-account resolution. Add deterministic routing and evaluation coverage before exposing similarly named customer and connector contexts.

## Security and privacy

- Never hard-code, commit, paste into tests, log, or display tokens, credentials, cookies, connection strings, private keys, or customer-confidential content.
- Store configuration in Vercel environment variables or the approved connection mechanism. Scope values by Local, Preview, and Production; document required names without their values.
- Apply least privilege to every external connection and service identity. Verify authorization on the server for every sensitive read or mutation; client-side checks are never sufficient.
- Do not bypass authentication, authorization, rate limits, audit logging, TLS validation, or security controls to speed up a demo.
- Sanitize and validate untrusted input. Avoid injection-prone dynamic shell commands, unsafe URL fetching, unrestricted file paths, and rendering untrusted HTML.
- Do not add telemetry, analytics, or data export without a stated purpose, data classification, retention expectation, and approved destination.

## Testing and validation

Run the narrowest meaningful checks before handing off a change, then expand when the risk warrants it.

```sh
npm run typecheck
npm run build
npm run eval
```

- `npm run typecheck` is required for TypeScript changes.
- Run relevant unit, integration, or evaluation coverage for behavior changes. Add regression coverage for a bug that could recur.
- For Turi behavior, include examples that test positive intent, ambiguity, same-name customer/connector collisions, missing data, unauthorized access, and safe refusal/mutation paths as applicable.
- Test loading, empty, error, and permission-denied states in user-facing flows—not only the success path.
- Use a Preview Deployment for meaningful UI, integration, routing, environment, or assistant-behavior changes. Validate the deployed Preview before production promotion.
- Do not claim validation that was not run. Clearly state any check that could not run and why.

## UI and accessibility

- Build calm, readable internal software that helps busy delivery teams decide and act. Prefer clear information hierarchy and progressive disclosure over dense dashboards.
- Use semantic HTML, keyboard-accessible controls, visible focus states, sufficient contrast, descriptive labels, and meaningful empty/error states.
- Make statuses explainable: show the evidence, timestamp, owner, confidence, and recommended next action where appropriate. Do not represent an inference as an observed fact.
- Support non-technical users with plain language, sensible defaults, and concise explanations of product or delivery terminology.

## Data, reliability, and observability

- Record source, freshness, and confidence for delivery-relevant facts when the underlying system supports it. Separate facts, inferences, risks, issues, and decisions.
- Design asynchronous and external-service workflows to tolerate retries, timeouts, duplicate events, partial failure, and unavailable connectors. Make mutations idempotent where practical.
- Log structured, actionable operational events without sensitive payloads. Include correlation or request identifiers when available.
- Add monitoring or an explicit owner for production-critical paths. A feature is not complete if a failure would be silent and materially affect customer delivery.

## Git, review, and deployment

- Keep commits small and coherent. Do not rewrite unrelated history, discard user changes, or modify files outside the task's scope.
- Review the final diff for accidental secrets, generated artifacts, lockfile churn, dead code, and changes that broaden access or behavior.
- Use a branch and Preview Deployment for reviewable changes. Promote to production only after the preview has passed the required checks and any relevant human approval.
- Treat migrations, permission changes, connector changes, and production-data changes as high-risk. Include a rollout, verification, and rollback plan before applying them.
- Keep documentation, tool descriptions, schemas, and evaluation examples in sync with behavior changes.

## Attribution and authorship

- Do not add AI, model, assistant, bot, Copilot, ChatGPT, or agent-generated attribution to source code, comments, documentation, commits, pull requests, user interfaces, release notes, or metadata.
- Do not add signatures, watermarks, hidden prompts, tracking fields, or provenance text that identifies how code or content was produced.
- Write all changes as normal, maintainable project work. Existing legal notices, third-party licenses, and required dependency attribution must remain intact.

## Definition of done

A change is complete when it:

1. Solves the stated user or customer-delivery problem with the smallest appropriate scope.
2. Has appropriate validation, including a successful type check for TypeScript changes.
3. Protects customer data, credentials, authorization boundaries, and production environments.
4. Includes the necessary documentation, evaluation coverage, migration notes, or rollback plan.
5. Leaves the repository cleaner and more understandable than it found it, without unrequested rewrites or attribution.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
