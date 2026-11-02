# Historical branch disposition

Assessed against main98cbb63c. Original commit ancestry alone is insufficient
because this repository uses squash merges. The private verified complete Git
bundle retains both original tips; detached worktrees and private artifacts are
outside this cleanup and are not removed.

## fix/chat-research-parity

Tip6995898a is exactly the recorded head of merged
[PR18](https://github.com/mcteer/turas/pull/18), squash2f0b3228 on main. Its three
commits implement the hosted watchdog and scheduler-cookie authentication;
those mechanisms remain in the current hosted-watchdog module with later
maintenance changes. Disposition: delivered by squash merge; retire the local
branch after this maintenance release. Do not cherry-pick its old commits.

## 016-legacy-parity-integration

Tip3f4c677d merges parent9c422ecc with ed1cff1e, the exact source head of merged
[PR34](https://github.com/mcteer/turas/pull/34). This combined historical tree also
contains an earlier production-hardening implementation, so neither whole-tree
replacement nor ordinary ancestry establishes an appropriate merge today.

There are940 changed paths from merge base64e0bca1. Blob identities compared
against all objects reachable from main establish839 exact historical file
versions, of which497 still match current main. The remaining101 are updated
compositions; they are not101 missing features.

| Difference group | Assessment |
| --- | --- |
|39 runtime/contract/config files | Current specialist tools use Eve0.91 serve/task APIs; native routes retain staged references, owner/session binding, question/reload and cancellation repairs. Recovery/capture modules now use the current schema, bounded streaming, actual transaction-bound denial reconciliation and additional retained-authority fences. All original named runtime function declarations remain; declaration presence alone is not claimed as behavioral proof. Hunk comparisons identify subsequent implementations, not a new feature to port wholesale. |
|Earlier schema074 references | Current ledger is85. Old073 workspace-session migration is byte-identical to current078; old074 operations migration has its current evolved counterpart079 and subsequent explicit migrations. Old migration numbering must not be reintroduced. |
|Old compatibility wrapper and task_cancel export | Removed by0148c517 with the Eve0.91 upgrade. Restoring the0.67-specific package patch would reject the installed version. Current native task controls replace the old exported tool. |
|Four hosted participant/browser acceptance files | Removed by d4564bff when the private pilot programme was explicitly cancelled. These are not missing production requirements. |
|Test/controller/source-evidence variants | Current files retain the original named script operations, with current schema/runtime identity, source/denial coverage and supervised process retirement. The old nested stop implementation is replaced by the current owned-process lifecycle. Catalog changes reflect later tests and cancelled participant work, not permission to restore old inventories. |
|Package locks, CI, styles and Playwright configuration | Superseded by merged parity/hardening/runtime/composer releases and current governed maintenance. Old trees would revert dependencies, CI selection and current UI. |
|README, roadmap and feature016 records | Historical claims and staged boundaries are superseded by the current release/handoff records; failed or cancelled acceptance must retain its original status. |

No additional unported production feature was identified in this comparison.
This is a source/history disposition, not a claim that static comparison proves
all historical runtime behavior. Existing current-source CI and hosted release
acceptance remain necessary. Disposition: preserve the original complete bundle,
retain current main implementations and retire the historical local branch only
after the replacement release is accepted. Never merge its old tree to remove a
branch count.
