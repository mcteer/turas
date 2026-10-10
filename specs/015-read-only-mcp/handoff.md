# 015 Implementation Handoff

Planning completed 2026-10-10 on `015-read-only-mcp` in the canonical checkout.
Select `SPECIFY_FEATURE_DIRECTORY=specs/015-read-only-mcp`. Read spec, plan, tasks,
contracts and quickstart; implementation has not begun and all 46 tasks are open.

## Authorized scope and decisions

Read-only external MCP for internal users and explicitly assigned partners,
individually revocable access intersecting current permissions. Five read categories;
no conversations, workforce/finance, private learning or cross-customer statistics.
Manual Authorization-header-compatible clients, modern protocol 2026-07-28, pinned
SDK 2.3.1. No OAuth/federation/legacy/universal connector promise. Twelve fixed tools,
no model execution, paid embeddings/research, customer writes, exports or sends.

Primary research resolved transport and domain authority before planning. Both
research agents were read-only and installed nothing. Existing eve/model remain
unchanged. Explicit read-authority union is foundational: never synthesize login
sessions or pass MCP actors into write/native commands. Do not expose existing UI
DTOs unchanged; some intentionally reveal draft or historical withdrawn material.

## Previous release and known CI limit

PR 26 merged as `3af1536ab4e346fc473ab00aeb72d53bdf965d4c`. The auto-merge
command unexpectedly merged it while CI was still running; the green-before-merge
condition was missed and disclosed. Never rely on `--auto` waiting behavior.

The complete local Product Gaps gate passed 84 cases after the bounded full report
journey timeout correction. Learning withdrawal/rollback timed out in two CI runs
while passing all 32 local cases. PR 27 added fixed non-sensitive phase diagnostics;
its 33 CI jobs/35 reported checks all succeeded before merge. That passing run does
not establish a root-cause correction for the earlier intermittent timeout.
PR 27 merged as `80c8f3422abd1e0978960bc0531ad5f0df5a1038`;
CI run `38059684052`. Both associated branches were deleted locally/remotely and
README was verified on main.

Production deployment `dpl_AF4ZizDXK7cffthmRtgrghENFc8q` is READY and aliased to
www.turas.dev at that exact commit. Authenticated HTTP/CLI WebKit checks after merge
passed for mcteer/panel/partner, including actual partner login form, workspace
projection, unassigned-customer denial, internal learning denial, Product Gaps
refresh and zero browser errors. Schema/ledger 054, learning activation and runtime
restrictions verified. Partner currently has no active customer assignments, so
positive assigned-record/workflow coverage remains unverified; no grants or customer
records were fabricated. All private evidence remains ignored under local-artifacts.

## Implementation/release boundaries

Do not run root dev or tests against selected Preview/Production; owned local
resources only, no sibling directories. Preserve `.env.local` and workflow state.
055 is proposed, not applied. Pin dependencies only in T001; follow installed docs
before writing Next/eve code. Common browser/native authority regressions are
mandatory because the shared read guard changes. Quotas and owned harness precede
story checks; do not release an unlimited incomplete checkpoint.

Planning authorizes no extra live-model evaluation or hosted schema changes. Future
release follows T046 only after explicit merge/release instruction and completed
green checks: target backup/rehearsal, 055/grants, disabled compatible deployment,
explicit enablement and Production checks with honest record-dependent limits.
Use eve for any authorized Vercel operation and preserve selected local config when
it pulls hosted variables. Roll back exposure with disable/revoke, not domain loss.

Next action after model switch: `$speckit-implement` with this feature selected.
