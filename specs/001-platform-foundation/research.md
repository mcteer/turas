# Foundation research and decisions

Date: 2026-09-26. Sources include the user's requirements, the reference repository
at commit `fd1e205` plus its working tree, installed eve docs and primary product docs.
No demo tests were rerun and no old data was migrated.

## R01 — Official pinned Spec Kit installation

**Decision:** Install Specify CLI 1.0.12 from official release commit
`e77daa9021d20db26b878f7dfa5640fe5a42d04e`; initialize Codex skills with Bash scripts.
Use explicit Git branching, sequential spec directories and an ignored local pointer.

**Rationale:** The current tool supports project-local skills and independent feature
selection. Version pinning makes regeneration reviewable. The optional Git extension
is unnecessary for this repository's ordinary Git/PR workflow.

**Alternatives:** Global prompt configuration introduces machine-specific setup;
unversioned installation drifts; copying templates manually loses installation state.

Sources: [release](https://github.com/github/spec-kit/releases/tag/v1.0.12),
[installation](https://github.github.com/spec-kit/installation.html),
[core commands](https://github.github.com/spec-kit/reference/core.html), installed
`specify init --help`, `.specify/integration.json`. Upstream license is preserved in
[.specify/LICENSE](../../.specify/LICENSE).

## R02 — Keep eve and use its native web integration when needed

**Decision:** Preserve the scaffold and model. Propose Next.js `withEve` for 002.
No web integration or other eve integration is installed in 001.

**Rationale:** The user requires eve at the center and visual continuity with the
Next.js demo. One documented integration avoids a custom stream/agent protocol.

**Alternatives:** Separate frontend/agent peer services remain possible but add
unneeded topology now. Wholesale demo copying brings outdated assumptions.

Sources: installed `docs/README.md`, `guides/frontend/nextjs.mdx`,
`guides/frontend/overview.mdx`, and registry `channel/web` inspection. Registry
scaffolding may select preview framework versions; review compatibility in 002.

## R03 — Identity and governed data precede recommendations

**Decision:** Build customer/partner grants and session ownership before profiles,
attachments, retrieval or business workflows. Use managed Postgres as authoritative
records and private Blob for artifacts; defer provider/region provisioning to 002/004.

**Rationale:** eve authenticates routes but does not enforce session ownership.
Storage access and vector similarity also cannot enforce Turas customer policy.

**Alternatives:** Shared demo credentials cannot support real partner access;
conversation/file memory alone cannot represent reviewed business records.

Sources: installed `guides/auth-and-route-protection.md`; [Postgres](https://vercel.com/docs/postgres),
[private Blob](https://vercel.com/docs/vercel-blob/private-storage). Registry research
of `connection/neon` and `memory/file` does not make those administrative/memory
integrations appropriate for application persistence; neither was installed.

## R04 — Reuse invariants and visual patterns, rebuild production boundaries

**Decision:** Adapt maturity/delivery skills, research separation, approved context
revisions, retrieval/source lineage, deterministic metrics and test scenarios.
Rebuild auth, document ingestion, real operations and absent workflows.

**Rationale:** The demo contains valuable domain knowledge but inconsistent stage
models, stale guidance and incomplete document/competency retrieval. Reusing it
unchanged would preserve those problems.

**Alternatives:** Starting without the reference discards useful learning; copying
the whole tree recreates speculative dependencies and synthetic-domain coupling.

Evidence: [reference review](../../docs/legacy-review.md) and
[design reference](../../docs/design-reference.md). Root instructions in the new
scaffold were an explicit user test; replace them with truthful foundation guidance.

## R05 — Separate acceptance, source quality and adaptive learning

**Decision:** Define a deterministic four-component quality rubric, age windows and
hard eligibility gates. Manual submissions require acceptance; independent research
can attach as attributed evidence. Learning publishes reviewed, evaluated versions.

**Rationale:** High relevance/reliability does not authorize factual acceptance, and
recent evidence can still conflict or be false. Preserve dates and lineage so changes
invalidate downstream guidance.

**Alternatives:** A single confidence score or automatic prompt rewriting is opaque
and cannot satisfy the requested approval gate. Freshness-only policy misses source quality.

Evidence: [policy](../../docs/evidence-policy.md), reference freshness/source integrity
modules and user requirements. Weights and bands are proposed for calibration in 005.

## R06 — Publish Turas MCP separately from its integrations

**Decision:** Plan an initially read-only MCP service backed by domain reads in 015.
No MCP server or external connector is installed in 001.

**Rationale:** eve connections consume external tools; they do not publish Turas data.
Sharing policy across UI, agent tools and MCP prevents inconsistent access.

**Alternatives:** Raw SQL or the entire agent tool catalog exposes unnecessary authority.

Sources: [MCP deployment](https://vercel.com/docs/mcp/deploy-mcp-servers-to-vercel),
[OAuth guidance](https://vercel.com/i/mcp-server-oauth-authorization), registry `mcp` search.

## R07 — Foundation checks must not depend on cloud sandbox preparation

**Decision:** Preserve `npm run build` for a full eve build; add `build:check` with
`--skip-sandbox-prewarm` for this foundation's compile validation and CI.

**Rationale:** The first full-build attempt waited at sandbox initialization and was
stopped. That work is not needed to verify governance and the authored scaffold.
Compile-only output is not certified deployable.

Source: installed eve `docs/reference/cli.md`, section `eve build`.

## Deferred choices

All foundation choices are resolved. Product identity, resources, retention,
brand assets, send policy, pilot budgets and MCP consumer choices remain explicitly
assigned to future feature gates in the [decision register](../../docs/decisions.md).
