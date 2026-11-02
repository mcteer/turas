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
