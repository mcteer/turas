# Turas

Turas is a customer maturity and delivery platform for Vercel Forward Deployed
Engineering, Professional Services, TAM, account teams and partners. **Turi**, its
eve assistant, will connect governed customer context to delivery plans, staffing,
execution, reporting and learning.

## Current state

This is a fresh build at the **planning foundation** stage. The repository contains
the eve scaffold, GitHub Spec Kit 1.0.12, project governance, product/architecture
plans, artifact templates and foundation checks. The existing model configuration
is preserved. Customer workflows, a web UI, database, RAG, reports and MCP are
planned; they are not implemented here. No new eve integrations have been installed.

The old demo at `../turas-back` was reviewed as a reference only. Its fixtures,
credentials, data and unused integrations are not the new platform. See the
[reference review](docs/legacy-review.md) and [visual contract](docs/design-reference.md).

## Start here

- [Roadmap and delivery order](ROADMAP.md)
- [Product blueprint and requirement coverage](docs/product-blueprint.md)
- [Proposed architecture](docs/architecture.md) and [decision register](docs/decisions.md)
- [Evidence, quality scoring and approval policy](docs/evidence-policy.md)
- [Plan and report templates](docs/templates/README.md)
- [Foundation spec and plan](specs/001-platform-foundation/spec.md)
- [Contributing](CONTRIBUTING.md), [coding-agent instructions](AGENTS.md), and
  [constitution](.specify/memory/constitution.md)

## Local setup

Use Node **24** (`.node-version`) and npm. Install locked dependencies:

```sh
npm ci
npm run check:docs
npm run typecheck
npm run build:check
```

Checks compile the scaffold and validate authored documentation without live model
calls, sandbox preparation or a customer database. `build:check` skips sandbox
prewarming; its output is not a validated deployable build. `npm run build` performs
the full build and may need configured sandbox infrastructure. `npm run dev` starts eve's agent development TUI;
it is not yet the planned web application. Live model calls need appropriate
AI Gateway access and may incur usage. `.env.example` documents the current
optional variable name. Keep real credentials in ignored `.env.local`.

`agent/channels/eve.ts` retains the scaffold's local/Vercel authentication and
browser placeholder. It is not production user/partner authentication. Feature 002
adds the application identity, authorization and UI. Do not expose private data
through this scaffold or reuse the demo database for new development.

## Spec Kit workflow

The official [Specify CLI installation](https://github.github.com/spec-kit/installation.html)
is pinned to the release used for this repository:

```sh
uv tool install specify-cli --from git+https://github.com/github/spec-kit.git@v1.0.12
specify version
```

Project-local Codex skills are already committed in `.agents/skills/`; start or
restart the coding session in this project to discover them. No global prompt
directory changes are required. Use `$speckit-specify`, `$speckit-clarify`,
`$speckit-plan`, `$speckit-tasks`, `$speckit-analyze`, `$speckit-implement` and
`$speckit-converge` as described in [CONTRIBUTING](CONTRIBUTING.md).

Spec Kit 1.x selects features independently of the Git branch. For this foundation:

```sh
export SPECIFY_FEATURE_DIRECTORY=specs/001-platform-foundation
.specify/scripts/bash/check-prerequisites.sh --json --require-spec --require-tasks
```

Create Git branches explicitly; the optional Git extension is not installed.
`.specify/feature.json` is a local ignored pointer. Do not rerun `specify init
--force` on a normal checkout. Upgrades require reviewing the official upgrade
procedure and generated changes while preserving the constitution and authored docs.

## Delivery and documentation

The next slice is **002: identity, persistence and application shell**, after the
foundation PR is reviewed and merged. Add an eve integration only when an active
feature uses it and verifies it. No speculative connector installation.

Deployment is a future feature action using `eve link` and `eve deploy`, as required
by [AGENTS](AGENTS.md). This PR does not provision or deploy resources. Every relevant
PR updates README in the same change; maintainers verify freshness after merge.
