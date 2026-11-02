# Continuous Integration

CI selects checks from the complete pull-request diff. A documentation-only
latest commit cannot conceal application changes earlier in the same PR.

| Change | Checks |
| --- | --- |
| Documentation only | Documentation/link/hygiene checks and CI-selector tests. |
| Existing client components and application styles only | Type/build checks and every browser project, including their completeness checks. Backend-only test commands and the serial recovery catalog are excluded. |
| Server components, agent instructions, models, authentication, migrations, dependencies, test inventories, or unknown inputs | Broad checks. Cross-feature backend dependencies remain conservative. |
| CI scheduling or documentation after an equivalent fully tested source | Fresh selector/documentation checks, plus verified reuse of the original successful execution. |

The client-only path requires existing regular files and actual `use client`
directives at both revisions. New, deleted, server, ambiguous, or mixed changes
fall back to broad checks. All four desktop/mobile browser projects are retained.

## Reuse Requirements

Reuse comes from GitHub's workflow and job APIs. Both original workflows must
have completed successfully, with every original job successful. Failed,
cancelled, pending, partial, and skipped jobs cannot supply a full baseline.

The selector compares all changed files, executable inputs, and workflow execution
contracts. Commands, step conditions, matrices, environment, runner, toolchain,
fixtures, schemas and lockfiles remain bound. Only explicitly supported scheduling
wrappers are normalized. Changes to the underlying execution contract require
fresh broad checks.

PR reuse derives the historical base/head from actual checkout logs and immutable
Git commit trees/parents; workflow PR-reference fields can change after a push and become empty after merge.
The PR identity comes from the actual checkout command in both original job logs.
If a deleted source branch makes a direct SHA fetch unavailable, the selector may
fetch that verified PR ref, but still requires the exact original tested commit;
it never substitutes the current PR head.
It verifies that head and merge checkout
contexts have identical trees. A later main update invalidates an older merge
context. A completed merge may reuse a genuinely tested equivalent tree; it does
not need a fictitious ancestor relationship to a squash commit.

The **CI Scope** job summary links the original source commit and workflow runs.
Reused results remain evidence from that original execution. They are never
rewritten as a fresh run or passed into current-source receipt validators.

## Failure and Coverage Rules

Unknown paths, unavailable provenance, changed commands, missing inputs and
unproven baselines select broad checks. A failed scope job fails the final check.
Every selected family must succeed; unselected families must be explicitly
skipped. Browser completeness jobs follow the same selection as their producers.

Scope-policy tests run without a package install or model calls:

```sh
node --test .github/ci/change-scope.test.mjs
```

Backend feature names alone are insufficient to narrow execution: several
regression runners cross feature boundaries. Further backend selection needs
verified dependency closures and tests for shared helpers and non-module inputs.
