# Tasks: Dependency maintenance

## Setup and foundation

- [x] T001 Inventory original PR53–59, alerts, branch identities and Vercel metadata in research.md.
- [x] T002 Specify bounded outcomes, capability adoption, contracts, rollback and release gates in this directory.
- [x] T003 Complete remaining upstream development/transitive release review in research.md and check installed Next guides before edits.

## US1 — Maintained production platform

- [x] T004 Add credential rejection and interrupted generation/stream accounting regressions in tests/unit/dependency-maintenance.test.ts.
- [x] T005 Implement selected dependency versions and compatible transitive patches in root/renderer manifests and lockfiles; audit extractor dependencies without blind major overrides.
- [x] T006 Adopt MCP boolean syntax validation and interrupted provider fences in lib/server/mcp/credentials.ts and lib/server/research/specialists/discussion-provider.ts.
- [ ] T007 Run regression/type/unit/extractor/build/audit checks and record actual results in validation.md.

## US2 — Trusted verification artifacts

- [x] T008 Update immutable action pins in .github/workflows/ci.yml and legacy-backend-parity.yml and enforce digest errors while retaining report attempt/directory/completeness behavior.
- [ ] T009 Validate workflow selection and actual complete-report CI execution; record evidence in validation.md.

## US3 — Assessed cleanup

- [ ] T010 Complete historical branch delta and Vercel dependency/retention assessment in research.md; preserve unresolved unique work and key custody.
- [ ] T011 Remove only evidenced stale Vercel branch overrides after release acceptance; verify credential inheritance and canonical project metadata.
- [ ] T012 Retire superseded PRs/branches only after replacement release; verify main README and remaining GitHub inventory.

## Release and documentation

- [x] T013 Update README.md and ROADMAP.md with actual maintenance status; run check:docs.
- [ ] T014 Open replacement PR; require up-to-date complete CI, actual protected Preview profiles and inspected WebKit captures; record exact source/results in validation.md.
- [ ] T015 Obtain maintainer review and merge passing source; verify deployed identity/schema and authenticated Production HTTP/WebKit before recording completion.

## Dependencies and strategy

T001→T002→T003 precede implementation. T004 precedes T006. T005/T006/T008 feed T007/T009. T010 informs T011/T012; T011/T012 follow T014/T015. T013 precedes PR acceptance. Independent source reads and local checks may run concurrently; shared manifests, installs, deployment and cleanup remain sequential. Deliver US1/US2 as one reviewed release, then complete evidence-based US3 cleanup. No parallel agents are required.
