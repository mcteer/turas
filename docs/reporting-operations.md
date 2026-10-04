# Reporting operations

Feature 009 is in development. Local checks do not establish hosted readiness.
Publication, brand approval, recipient-policy approval and each send are separate
decisions; only `mcteer` has decision authority. A schedule prepares drafts, not mail.

## Configuration and enablement

Use the variable names in `.env.example`; keep their values private. Explicitly
apply migrations 039–041 and refresh runtime grants before enabling reports. Do
not initialize or migrate from an HTTP handler. Run the app using the narrowly
granted runtime login, not the migration owner.

Prepare a separate private report store and the pinned renderer with
`npm run reports:prepare`. Its root must not overlap the upload/workforce stores.
Preserve the catalog and matching report bytes together in backups. Preserve the
selected application database and `.eve/.workflow-data` during recovery.

`TURAS_REPORTS_ENABLED` controls new report work.
`TURAS_REPORT_DELIVERY_ENABLED` separately controls provider dispatch and defaults
to false. Leave it false until lifecycle gates, actual brand-sample review,
verified sender configuration and exact test-recipient approval have passed.
Never treat fixture approval as real operator approval.

Root `npm run dev` supervises the reporting worker alongside existing workers.
Check reporting readiness and worker heartbeats before preparing jobs. A worker
failure is not permission to bypass a release fence or run as the database owner.
Renderer jobs have no network and use approved static Geist fonts. An unsupported
glyph, substituted/missing font, stale source or missing file blocks release.

## Review and delivery

Inspect actual weekly, monthly and quarterly samples in the brand review flow.
Approval binds the font, asset, template and renderer hashes. The authored slide
master is not an official corporate master. Editable slides require approved
Geist installed in the editing environment; LibreOffice checks do not prove
PowerPoint portability.

Approve the exact policy sender, audience, scope and recipients. Then publish an
exact reviewed revision. Review the actual send preview and authorize each send
separately. Never infer send approval from publication or a recurring schedule.
Keep recipient addresses, provider IDs and provider evidence outside Git.

Provider acceptance is not delivery. Inspect signed delivery events and retain
their distinct delivered, bounced, complained, failed or uncertain states.
Bounce/complaint suppression must not be bypassed with a new policy revision.
Never resend successful recipients as part of recovering other recipients.

## Uncertainty and withdrawal

Use the original request key to recover a lost acknowledgement. Do not create a
replacement request merely because the browser timed out. A provider attempt
reuses its exact bytes and key; it must not start at or beyond 23 hours after
first dispatch. Unknown outcomes require operator reconciliation, not automatic
replacement sends. Only use a known provider message ID and bounded status lookup;
do not infer a receipt from elapsed time or acceptance.

Source withdrawal immediately prevents release. Corrections create a new revision
and require fresh publication/send review. Neither withdrawal nor cleanup recalls
copies already downloaded or delivered. History must retain this distinction.

The user confirmed `report-retention-v2`: after 730 days, retain only minimal
content-free technical identity/link tombstones for replay protection and correction
lineage. Do not retain report text, addresses, provider diagnostics or reviewer
rationale in those tombstones. Exact leased cleanup minimizes receipt results,
reviewer attribution/rationale proofs, obsolete revision authorship/watch metadata
and provider diagnostics. It preserves scope/request/publication/recipient identity
and predecessor/suppression links, source/template/file digests and the first-dispatch
clock needed to prohibit a replacement send. Calculation inputs/results and time
decision detail are payloads, not perpetual audit. Expired previews are removed;
unmatched signed receipt IDs are capped at 1,000 per environment and removed after
24 hours in batches of at most 100. See the source-bound lifecycle and retention
checks in the feature validation record; none proves private-customer policy approval.

## Local validation and recovery

- `npm run test:reports`: complete explicit deterministic reporting manifest;
  rejects omissions, duplicates and skipped assertions and writes source-bound
  private completion evidence.
- `npm run reports:ui:check`: owned runtime app/worker/store, four WebKit projects.
- `npm run reports:artifacts:check`: actual six-pair rendering and office editing;
  visual inspection remains a separate source-bound gate.
- `npm run benchmark:reports -- --disposable`: representative corpus, seven
  read classes, 20 weekly preparations, 12 actual executive pairs, independent
  arithmetic/privacy sentinels and queue/rate/overflow/fairness boundaries.
- `npm run reports:recovery:check -- --disposable`: matched snapshot restoration
  plus explicit upgrade, lease, orphan, missing-file, disabled-cleanup and actual
  local process-exit cases. Provider transport remains simulated in this gate.
- `npm run test:reports:regressions`: explicit prior-feature unit/integration layer.

The reporting test/UI runners use a uniquely labeled disposable local Postgres
container and individually marked clones, not the configured application DB.
They restore process configuration and remove only resources they own. Private
failure evidence belongs under ignored `local-artifacts/009/`.

Recovery, representative-load, prior-feature regression and controlled real-send
gates remain required before release. Restore the paired catalog/store first,
recheck exact source eligibility and durable authority, and quarantine uncertain
dispatches. Disable new reporting/dispatch rather than rolling back immutable
audit history. Cleanup and receipt settlement must continue while new reporting
is disabled. Do not deploy, reconnect Vercel or claim hosted acceptance from these
local checks.

## Controlled test and release tooling

Do not run the live command until a maintainer has approved the actual brand
samples, verified sender and the exact synthetic test publication and recipient
through the normal review flow. It cannot create or replace those approvals.
Its three identifiers come from the already-authorized delivery; no recipient
address or provider credential belongs in command arguments.

```sh
npm run reports:delivery:check -- --live --synthetic-test \
  --delivery-id=<approved-delivery-uuid> \
  --payload-digest=<exact-approved-request-sha256> \
  --recipient-digest=<exact-approved-recipient-hmac>
```

This tool claims only the specified first-attempt delivery, verifies current
durable authority and live sender configuration, and dispatches at most once.
It refuses owned-fixture mode. If the original provider ID is already known,
rerunning performs a read-only exact-content evidence lookup; interrupted
dispatch without a provider ID requires normal operator reconciliation, never
a replacement send. Provider acceptance remains blocked pending actual delivery
evidence. Private provider proof and sanitized completion evidence are separate.
The live command requires the default-off dispatch switch to be explicitly enabled.

`npm run reports:release:check -- --evidence=<private-completed-json> ...` accepts
explicit completion records under `local-artifacts/009/`. It requires deterministic,
four-project UI, six-pair actual artifact review, full load, full recovery,
prior-feature regression and actual controlled-delivery records at one current
source digest. Partial, stale, duplicate and fixture-live records are refused.
It also rechecks current store/font/brand/sender/worker readiness and real provider
delivery evidence. Missing gates remain blocked. It sends nothing, deploys nothing,
and never certifies hosted readiness. Run typecheck, production builds, docs and
diff checks separately and retain their exact results in the validation ledger.
