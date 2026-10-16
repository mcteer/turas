# Production parity release — 2026-10-15

The user authorized the complete backup, migration, grants, deployment and
verification sequence. The repaired application from
[PR 34](https://github.com/mcteer/turas/pull/34), commit
`1fceed37043c16589d00fabbafa6ff1b0012f7f2`, is serving Production at
<https://www.turas.dev>. Vercel confirms the exact commit, READY state, Production
target and assignment of both canonical domains. The application and selected
root model are unchanged from the accepted merge. The deployment tool generated
only an install-script lockfile flag, development type-reference paths and a
Vercel ignore entry locally; those generated changes are excluded from this PR.

## Database and recovery evidence

The existing protected Production connection was checked against its environment
marker, schema 055 and the authenticated live directory before any write. No
response attempts were active. The selected local Preview database and local
Workflow store were preserved.

A PostgreSQL 18 client used a consistent exported, read-only snapshot with full
TLS verification. Its custom-format backup was encrypted with AES-256-GCM and
retained outside Git in the work-controlled recovery location. The saved encrypted
artifact and key were read back, authenticated, decrypted and checked against the
original dump hash. That decrypted saved artifact supplied the restore rehearsal.
Private descriptors, hashes, table fingerprints, keys and captures are retained
privately; no credentials or database contents are committed.

The restored disposable clone matched all 409 original public tables. Explicit
migrations 056–072 and `scripts/db-role-setup.sql` then preserved original columns
and rows, allowing only the expected schema marker change and appended migration
ledger entries. Both the previous Production code `64e0bca` and merged repair
`1fceed3` passed authenticated directory/profile HTTP reads against schema 072.
Owned clone containers and temporary connection material were removed afterward.

Production migrations and explicit runtime grants completed at
`2026-10-15T22:21:00Z`. The environment marker remains unchanged at schema 072.
Runtime research, pattern, native-input, steering, model-reservation and inventory
write grants were checked, together with denials for inventory deletion, marker
updates, migration-ledger updates, ordinary output-ceiling updates and budget-cap
updates. The old live app passed authenticated HTTP and desktop/mobile CLI WebKit
reads on the upgraded schema before the new build replaced it.

Recovery keeps or redeploys compatible old code and uses forward schema repair.
The verified pre-release snapshot is retained for deliberate recovery; it is not
an automatic destructive rollback and does not include later writes. Reconcile
later authorization, denial and replay changes before any snapshot recovery.
This database rehearsal does not certify the separate paired Workflow/pilot
recovery requirements of feature 016.

## Actual Production acceptance

Authenticated HTTP and headless CLI Playwright/WebKit checked real responses,
without fixtures or response substitution:

- All 184 real customer references remain in the directory. Browser-form login
  and logout work on the canonical Production URL.
- 1Password and Notion show Customer Overview before workload controls, sourced
  product buttons, source details and actual Sandbox evidence-search results.
  Desktop dark and mobile light captures were visually inspected.
- One normal chat resolves 1Password by name without a picker, describes its
  public business and evidenced Vercel Sandbox integration with two retained
  citations, and distinguishes public integration from private deployment.
  Desktop/mobile rendering and reloaded history pass without overflow or active
  page errors. A subsequent read-only reload has no page errors.
- `mcteer` receives HTTP 404 for the temporary `panel` conversation, preserving
  conversation privacy across internal accounts. The exact native test session
  was retired with HTTP 200 and its owned conversation archived.

The chat driver initially matched its refusal expression against the user's own
question. Its original failed receipt is retained. A separate read-only check
confirms the actual assistant text contains no such refusal and has two source
links; it does not resend the question. One fetch failure coincided with one
recorded navigation cancellation on the first reload, with no active-page errors.
No specialist, new research, continuation approval or separate paid reviewer was
requested for the Production smoke. The finite Preview ledgers remain preserved.

## Direct deployment login correction

The immutable Production Vercel URL rejected login with `Request origin denied`
because the guard admitted only the configured canonical Production origin.
Credential checking had not started, so changing the username could not fix it.
The correction admits only the deployment's exact platform-provided `VERCEL_URL`
as an additional origin. Canonical configuration, Preview branch support, cookie
and CSRF checks remain in force. Other deployment URLs, lookalike suffixes,
request-host spoofing and caller-supplied alias settings remain denied. A failing
regression reproduces the issue; all 13 focused configuration/auth checks then
pass. Exact Preview `6993f535411603aa9c777842c05e58ffe3b053eb` passes six actual
CLI WebKit browser-form login/logout checks: `mcteer` and `panel` on the immutable
Preview URL, its branch alias and canonical Production. Every check includes an
authenticated directory read, foreign-origin denial and post-logout denial, with
no model dispatch. Final-head Preview acceptance, the final Production commit and
its direct-origin acceptance are recorded in the release PR before completion.

## Remaining limits

The original three-specialist Notion workflow and fresh independent source-based
answer review passed in Preview, as recorded in the
[parity audit](legacy-backend-parity-audit.md). This release does not claim those
specialist runs were repeated in Production. Native binary uploads stay disabled
outside explicitly admitted infrastructure. Production credential replacement,
new customer catalogs and full feature-016 hosted recovery, retention, operator,
scale and pilot acceptance are outside this release.

The release configuration restores automatic deployments from `main` only after
the schema/grants and old/new compatibility checks above passed. Final merge,
checks, deployed commit and post-merge authenticated verification are recorded in
the release PR; CI alone does not establish release completion.
