# Foundation interface contract

The foundation introduces no runtime API, MCP endpoint or database contract.
Its contributor-facing interface consists of:

- `.agents/skills/speckit-*/SKILL.md`: installed project-local workflow skills.
- `.specify/scripts/bash/check-prerequisites.sh`: feature artifact resolution;
  select the feature with `SPECIFY_FEATURE_DIRECTORY` rather than assuming the branch.
- `npm run check:docs`: authored Markdown target checks and tracked-path hygiene;
  nonzero exit on failure. It does not crawl external links or scan secret contents.
- `npm run typecheck`: existing TypeScript check.
- `npm run build:check`: compile-only eve validation, without sandbox preparation.
- `.github/pull_request_template.md`: required PR reporting format.

Product artifact content contracts are in [docs/templates](../../../docs/templates/README.md).
Each implementing feature must turn those contracts into typed validation and
renderer tests; Markdown alone is not enforcement. Evidence policy is similarly
implemented in the relevant context/retrieval features.
