# Maintenance validation

## Current state — 2026-11-02

Implementation is in progress on `021-dependency-maintenance`. No maintenance
release has been merged or deployed. Original dependency PRs remain open until
their work has a delivered replacement. Both historical local branches and the
verified private Git bundle are preserved.

## Local evidence

- New regression: 18 cases; four interrupted-accounting cases failed on the
  original guard and all 18 pass after the fix. Both generation and streaming,
  ordinary settlement and external fees, error/complete/interrupted finishes,
  malformed MCP input and unissued valid-syntax credentials are covered.
- Node24.21.0 full ordinary unit command: 177 files / 801 cases pass. The first
  host-default invocation used Node26 and lacked test configuration; it failed
  nine cases and is not a passing baseline. The corrected run uses generated
  synthetic configuration and a non-connectable database address.
- A pre-existing Support fixture expected a literal matrix removed by the
  feature020 CI selector. It now asserts the actual selector output binding;
  original bootstrap/role/isolation assertions remain. Selector tests cover the
  output matrix itself.
- Node24 typecheck and all 25 CI-selector tests pass. Documentation checks pass.
- Artifact extractor builds and its existing tests pass under Node24.
- Root audit after install: zero critical/high, three moderate and eight low
  package findings (including affected parent packages). Renderer: zero findings.
  Extractor: eight moderate package findings. These are npm audit package counts,
  not equivalent to the initial 31 GitHub advisory records.
- Node24 complete build is running; hosted CI/Preview/Production remain pending.

## Residual dependency findings

The remaining root moderate chain is node-pg-migrate9→glob13→minimatch10.
Extractor moderate chains use ExcelJS4.4→archiver/zip-stream/glob7 and
minimatch3/5. Published latest node-pg-migrate9.0.0 and ExcelJS4.4.0 do not remove
these chains. Audit recommends downgrading the parent, which is not accepted as
proof of a safe fix. Cross-major overrides require actual migration-discovery
and archive extraction compatibility work; none was applied blindly.

Root low findings involve KaTeX and its math/diagram consumers. The latest
published math/mermaid plugins still constrain older majors. Math rendering is
used and must retain sanitization and readable rendering through an explicitly
tested upgrade. No finding has been dismissed or relabelled fixed.

## Hosted and cleanup evidence

Preview credential metadata check passed before edits: one existing sensitive
administrator record serves Production and Preview, with zero overrides. No
credential was changed. No Vercel resource or environment record was deleted.
The large historical branch still requires disposition of unmatched file
versions; exact historical blob coverage alone is not complete behavior proof.

## First hosted pass and renderer correction

PR61 source7b6e3eea built successfully in Vercel Preview, but authenticated login
returned an unavailable state. Baseline Preview configuration was insufficient
for the current source. The25 existing isolated review overrides from absent
chore/eve-dependabot-composer were reassigned to021-dependency-maintenance by
changing only gitBranch. IDs, types, targets and values were retained; Production
records were unchanged and shared credential inheritance still passes. A new
source deployment is required to exercise that configuration.

First CI reporting deterministic/WebKit and product-gap deterministic checks
failed. Reporting deterministic reached renderer output validation. The renderer
package was1.64.1 while its Docker base digest was the verified1.63.0 image.
The base now pins the registry-verified1.64.1 multi-platform image digest. The
rebuilt image passes the actual owned report-audience contract (one case, no skips).
The first local focused invocation stopped at an absent fixture image tag; after
adding the expected tag to the same rebuilt image, the real rendering case passed.
No report output validation was weakened.

The first native-staged10 CI check failed at restart_after_native_receipt with
WebKit page.reload frame-load interruption. The unchanged original check is being
replayed locally. This failed CI is not a reusable passing baseline. Other
completed jobs retain their original scope and outcomes.

## Corrected-source acceptance and platform findings

Node24 rebuilt application/Eve checks pass. The unchanged original native-staged10
owned restart check passes locally with zero paid calls; the original CI frame-load
interruption remains a failure. Source67438a3b passes actual authenticated Preview
and branch-alias login, real directory comparison and1Password/Notion profile,
source and hybrid evidence-search checks. Four desktop-dark/mobile-light captures
were inspected: overview/layout is readable; mobile captures cover the first
viewport, not the entire long profile. No response substitution or research
mutation was used.

The current Linux/amd64 renderer was also built, pushed to the existing project
registry and reported Ready. Its immutable index is8055c355a9ab77e15e6bc4f439b126413ac65ee012b2732017988575e27c3d89,
with manifest2517b68bea4d6f6d42b97450fb4a88d96d8ebbf05eb5d026807e3f349205b9b8.
The existing Production renderer reference remains unchanged: its digest is part
of the immutable paid-job budget scope. Reporting is not enabled in the Production
environment. Prepared image publication is not a claim of hosted execution or
permission to reset/expand budget authority. A separately governed bounded scope
handoff is needed before activating that image; original holds/caps/expiry remain.

Source67438a3b CI exposed a Linux-only controller defect: absent TMPDIR was assigned
to process.env as the literal string undefined. A shared defined-only parent
allowlist now applies the existing pilot guard to gaps, learning, partners and MCP
controllers. Eleven focused cases (including missing-TMPDIR, private-input exclusion
and original gap coverage checks) and typecheck pass. The complete affected deterministic
acceptance passes with TMPDIR absent:15 suites /121 cases, zero skips. No
case/assertion/deadline was removed. Final-source CI remains required.
