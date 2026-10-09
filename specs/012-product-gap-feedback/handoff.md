# 012 Implementation and Release Handoff

**Date**: 2026-10-08
**Branch**: `012-product-gap-feedback`
**Checkout**: `/Users/mcteer/Projects/turas`
**Base**: merged 011 on main, `b5d54276c9e46630b3dd9401c573d5788d9337cd`
**Scope**: Four product-gap stories and their complete local acceptance gates. Final results and PR status are recorded in [validation.md](validation.md).

## Implemented behavior

Internal members propose gap narratives and customer impact observations. Only canonical active internal administrator mcteer reviews them, confirms exhaustive merge/split assignments, approves exact customer disclosure and records manual handoff events. Working and reviewed heads remain separate; history, receipts and canonical identities are append-only.

Original evidence and current access govern reads, counts, review and export. Confirmation requires independently adequate accepted customer need and direct current product evidence. Public attribution remains suspected. Customer sets suppress suspected-only when confirmed; resolved history is nonadditive. Missing primary history fails explicitly, and incomparable optional history reports unavailable.

Engineering detail/portfolio reports are deterministic and self-contained in-app, Markdown and JSON. Preparation has an absolute admission plus 30-second deadline, separate catalog identities and no automatic retry. Approval binds exact audience and every disclosed customer. Exports validate actual bytes and recheck authority between chunks; cancellation and revocation stop further release. Manual initial handoff, follow-up and correction retain attribution; expiry or withdrawal permits metadata-only follow-up and flags human review. There is no external send/fetch or automatic customer resolution.

The existing reports-worker process runs an independent 012 timer. Cleanup uses exact catalog/environment/lease identities, preserves 009 files, quarantines tampered bytes and reconciles missing files. Time-only critical quality expiry uses the original failure deadline; access loss by one actor never globally purges another actor's content. Minimal identities, original lineage and lifetime keyed tombstones remain after payload expiry.

## Local validation

Read root governance and the [spec](spec.md), [plan](plan.md), [tasks](tasks.md), [contracts](contracts/domain.md) and [quickstart](quickstart.md). Select `SPECIFY_FEATURE_DIRECTORY=specs/012-product-gap-feedback` when resuming. Runners use owned ignored directories, loopback PostgreSQL, synthetic data and private CLI WebKit captures; they sanitize inherited configuration and tear down their exact resources in `finally`. No additional checkout or sibling Projects directory is needed.

The deterministic manifest has 15 suites. Browser acceptance requires all six journey files in each of four WebKit projects with zero skipped cases. The benchmark verifies exactly 200 customers, 2000 gaps, 10000 observations and 40000 revisions, at least 100 operations per class with five readers and a separate reviewer, p95 ≤ 2 seconds and 100-gap preparation ≤ 30 seconds. Recovery covers empty→049 and 047→049 with the actual root supervisor, crashes, staged objects, disabled cleanup and retained tombstone keys. Relevant 003–011 regressions run without paid evaluations. Consult the validation ledger for executed source fingerprints and counts; planned checks are not acceptance evidence.

## Hosted release prerequisites

Preview and Production have not been migrated or certified by 012 local checks. Preserve the selected database, `.env.local` and `.eve/.workflow-data`; do not relink or deploy implicitly. Before an explicitly authorized release:

1. Back up and verify the selected environment, apply explicit migrations 048–049 in order and apply the checked-in least-privilege role setup.
2. Prepare the private report store with `npm run gaps:prepare`; verify its environment marker and ensure it is separate from uploads. Configure `TURAS_012_RECEIPT_HASH_KEYS` with at least one strong key and retain all historical verification keys for lifetime tombstones.
3. Verify the existing reports-worker runs the independent 012 tick and can maintain retention while `TURAS_012_DISABLED=1` or 009 is disabled. No new daemon, cron, provider, connector or model behavior is introduced.
4. Check real hosted session/role boundaries, source withdrawal, approved audience exports, manual handoff and disabled retention. Record Preview and Production results separately.

Recovery is forward-only on the same database, private store and workflow directory. Stop new work with `TURAS_012_DISABLED=1`; cancel or reconcile existing identities and keep cleanup running. Abandoned jobs fail without retry. Restore compatible code/configuration after applying a reviewed forward migration; never recreate schemas inside handlers, reuse expired keys or restore withdrawn bytes. Quarantined files require an operator to resolve their exact identity before deletion.

A focused PR includes actual checks and release limitations. Merge only when authorized and CI is green. After a successful merge, leave the PR closed, delete its local/remote feature branch and verify README on main. Do not start 013 as part of this scope.
