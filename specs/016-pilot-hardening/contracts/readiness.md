# Readiness and Operator Command Contract

Version `pilot-readiness-v1`; strict schemas and limits are defined in
[data-model.md](../data-model.md). These are planned commands, not current tooling.

## Command surface

| npm command / script | Inputs | Output and effects |
| --- | --- | --- |
| `pilot:check` / `scripts/pilot-readiness.ts` | `--run <private-manifest>` | Read-only validate explicit receipts; safe JSON table and `eligible`/`ineligible`; no approval/deploy/paid calls |
| `test:pilot` / `scripts/test-pilot.ts` | No suite filters or command overrides | Complete registered deterministic catalog in owned local environment; safe receipt |
| `pilot:ui:check` / `scripts/check-pilot-ui.ts` | Owned run identity | All four WebKit projects; zero failed/skipped/flaky acceptance |
| `pilot:recovery:check` / `scripts/pilot-recovery.ts` | `--disposable`, optional exact `--resume <manifest>` | Owned restore/fault drill only; source/config preservation and cleanup receipt |
| `pilot:lifecycle:check` / `scripts/pilot-lifecycle.ts` | `--disposable` | Complete registered classes with clocks advanced only in owned fixtures |
| `benchmark:pilot` / `scripts/benchmark-pilot.ts` | `--disposable` | Fixed workload, no quota resets/provider keys, per-class measures |
| `pilot:hosted:check` / `scripts/pilot-hosted.ts` | `--scope <private-scope> --run <manifest>` | Exact target/role checks; only pre-admitted synthetic workspace mutations; no external send/model dispatch by default |
| `pilot:backup` / `scripts/pilot-backup.ts` | `--scope <operator-file> --output <private-root>`; explicit backup/restore/verify mode | Owner-only matched backup/inventory or isolated restore; never in-place target replacement or deployment |
| `pilot:provision` / `scripts/provision-pilot-workspace.ts` | Exact target marker and private reviewed scope | Idempotent synthetic workspace/customer/member/grant provisioning; no factual approvals or overwrite of primary records |
| `pilot:feedback` / `scripts/pilot-feedback.ts` | Explicit private participant record | Validate and bind supplied human feedback; no invented responses or automatic messages |
| `pilot:regressions` / `scripts/check-pilot-regressions.ts` | Owned run identity | Complete affected predecessor catalogs, exact expected case inventories |
| `pilot:ci:evidence` / `scripts/pilot-ci-evidence.ts` | Explicit downloaded run artifacts and commit | Validate complete current CI evidence; never scan for unrelated successful runs |

Paths are structured arguments, not shell fragments. Reject unknown flags and
symlinks, traversal, oversized JSON and externally supplied executable commands.
`pilot:check` exits 0 only when technically eligible, 1 for valid but incomplete/
failed readiness, 2 for invalid input or unsafe precondition. All other runners exit
nonzero on unavailable or incomplete required cases and produce accurate state.

Deterministic commands strip provider credentials, use loopback owned Postgres and
private stores under `local-artifacts/016`, and never load selected `.env.local`
into child jobs. Hosted commands validate the explicit target and scope and never
fall back to the selected local environment. Preserve its bytes and root workflow
state before/after the run. Provider credentials are supplied privately only to the
specific admitted hosted adapter, never echoed or passed on CLI arguments.

## Evidence selection and freshness

Freeze catalog, expected suite inventory, source digest and run UUID before checks.
Every child emits a receipt for that run. Bind paths to exact private bytes, count
expected cases and reject skipped/flaky acceptance. Missing receipt is unverified;
unavailable prerequisite is blocked; a failed execution is fail. A pass from another
environment/method/attempt cannot overwrite these states.

A resume verifies all prior byte digests and source/catalog/environment identities.
After a failing gate, fixes require a complete rerun of that gate plus affected
dependents. Preserve the failed attempt, select one complete later attempt explicitly
and never splice individual cases. Source changes invalidate all impacted suites;
use exact feature source digests for independent predecessor runners, not forged
016 digests. Final 016 bundle binds their actual sources and compatibility review.

Current hosted proof is ≤24h old and has a ≤30min final deployment/schema/config/
role/worker check. A changed runtime, grant, storage configuration or source invalidates
its affected evidence immediately. The checker has no `--ignore`, `--force-pass`,
`--skip-required`, fake owner or alternate shell command escape.

## Cost and quality admission

Each paid service run records its own applicable operator authorization reference,
USD cap, cost source/version, reservations, actual/estimated charges and unknowns.
Reservations use documented upper bounds; admission fails if no finite bound or
remaining budget exists. Account for in-flight work until reconciled. Cancel/stop
owned compute on deadline; provider creation uncertainty blocks retry. Hosting,
Blob/VCR/Sandbox, model/research/embedding and email costs stay separate. Estimates
are labeled and never represented as invoices. Record fixed monthly resources too.

Use governing feature verifiers for actual-model captures/reviews. A synthetic
provider proves mechanics only. Unchanged behavior may reference historical proof
with its actual date and exact verified applicability; changed instructions/tools/
retrieval/publication paths require fresh representative actual-model proof under a
new applicable budget. No prior feature budget is silently reused.

## Human decision

Technical eligibility is not release approval. The operator records actual mcteer
instruction/review attribution, exact scope and evidence-bundle digest separately.
A private JSON string `actor: mcteer` cannot create authority. This CLI has no launch,
grant, approve-fact, publish or send action. Domain operations remain authenticated
through their existing server paths; owner-only recovery/provisioning uses explicit
operator access. Reuse already-given authorization when it covers the exact action.
