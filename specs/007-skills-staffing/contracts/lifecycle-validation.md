# Lifecycle, operations and validation contract

## Test and environment boundaries

Production Neon is live and must never be connected to, migrated or altered. Preview
was last verified at schema031 after 006; this planning work does not reinspect it.
All destructive checks use the marked test database or owned clones through a 007
wrapper around `scripts/plan-eval-environment.ts`. The wrapper additionally isolates
workforce store, artifact store, ports, worker heartbeats and eve state, and deletes
only resources it created after verifying their marker. Never copy Preview or
Production data to a test clone. Keep credentials and outputs out of logs/Git.

Proposed migrations: 032 workforce/import/competency; 033 calendars/demand/allocation;
034 finance/advisory. Test an empty target and an owned schema031 fixture, then narrow
runtime grants. Feature readiness requires034; leave the existing global minimum
unchanged so older app features can still run. No runtime migration. Feature switch
`TURAS_007_DISABLED=1` blocks new writes/imports/advisory dispatch, but eligible reads,
owned cancellation, receipt reconciliation and cleanup continue. Finance is still
subject to current authority. Rollback is disable+forward repair, not destructive
migration down against accepted records.

Only after all disposable gates pass: run `npm run db:inspect-preview`, verify the
fresh configured marker and expected source schema, explicitly migrate and apply
roles, then inspect again and perform non-destructive local app smoke. If the marker
or migration base differs, stop the upgrade and reconcile it. No Vercel linking,
reconnection or deployment. Preserve selected app DB and `.eve/.workflow-data`.

## Source and worker invariants

Workforce originals and parser results use separate private ownership/store roots;
customer artifact cleanup cannot claim them. Reserve upload/storage quota atomically,
verify actual original digest and clean scan, and publish only if current manager
identity, lifecycle generation, lease token and digest still match. Cancel/revoke/
withdraw wins against late upload, scan, extraction, mapping and approval. Scanner
and parser run outside SQL transactions with the existing isolated images. The
structured extraction mode has explicit version and limits; 004 parser contracts
and regression fixtures must remain valid.

Immediate source checks exclude withdrawn/superseded/purged material with cleanup
paused. Imported competency is withdrawn when its source ceases eligibility; manual
assessment withdrawal uses its own header. Current matching/source/history views
return safe withheld states. Confirmed assignments retain identity and consume
capacity but show needs-review; new confirmation fails. Replaced source revisions
never inherit approval. Old cleanup jobs can only delete exact old payloads. Native
advisory fences apply to all consumed personnel/capacity/finance dependencies;
existing conversation retention/quarantine must not expose withdrawn derived prose.

A worker lease can be reclaimed only with a new attempt token; late publication
cannot overwrite a newer result. Pause/resume worker, retry allowed transient scan/
parse infrastructure failures, cancel import, expire reservation and reconcile an
unconfirmed advisory through bounded maintenance. Retention uses scoped maintenance
authority plus exact source ownership/generation; a revoked uploader session cannot
prevent deletion of already retired payloads. Failure telemetry has safe codes,
counts, time and opaque IDs only. No names, raw parser errors or financial values.

## Required deterministic and race matrix

1. Authorization: mcteer versus panel/partner/second admin, cross-workspace customer
   and workforce IDs, partner-resource eligibility/grant revoke, session/member/
   principal disablement before reads, decisions and same-key replay.
2. Import: real synthetic CSV and multi-sheet XLSX, blank/malformed/duplicate rows,
   hidden/merged/shared-formula cells, date-system and locale cases, oversized/partial
   source, malware/unavailable scanner, exact source locators and no customer-RAG rows.
3. Source lifecycle: withdraw/correct/retract/supersede/purge; title/cell/evidence/
   history/match/scenario/context/stream/replay with cleanup paused; old cleanup after
   new accepted evidence; native context already consumed when withdrawal happens.
4. Calendar corpus: interval union, partial leave, holiday/leave overlap, protected
   intersections, DST gap/repeat/straddle, timezone change, leap/month boundary,
   unknown/zero/negative capacity and future certification coverage.
5. Freshness: exact 7/14 and 90/180-day boundaries, explicit review deadline earlier
   than the generic window, future evidence dates, approval not refreshing assessment,
   work spanning an expiry, and future calendar coverage without future observations.
6. Matching: all hard constraints, desired-skill/remaining-capacity/ID tie breaks,
   stale result cursor, partial resource scope, no cost-based rank, no eligible result.
7. Decisions: concurrent first confirmations competing for resource or demand minutes;
   confirmation versus calendar reduction/source withdrawal/baseline replacement;
   cross-resource/date amendment versus cancellation; stale preview/version/digest;
   revoked identity before replay; release/cancel after withdrawal; reduced demand still
   counting older confirmed revisions; injected failure after ledger update; no duplicates.
8. Economics: rates crossing effective periods, gaps/overlaps, split-allocation rounding
   invariance, zero/missing revenue/cost, supported currency exponent, mixed currency,
   negative contribution, numeric limits and policy/input revision snapshots.
9. Advisory: fake provider proves step seven never invokes it, clamp generate/stream,
   denied generic/mutation tools, scope sentinels, output dependency union, quiet/active
   stream revocation, saved replay, cancellation, uncertain dispatch and restart.
10. Trusted journey: use actual 003/004/005 review and 006 exact acceptance to create
    the baseline, real synthetic workforce import/review, match, confirmation and
    finance scenario. Assert stored source/baseline/resource/decision IDs and capacity
    totals, not only screenshots. Do not seed accepted evidence for this journey.

## Performance and runtime gates

`benchmark:staffing` seeds an owned clone with 500 resources, 50 skills, 20000
competency revisions and 10000 dated allocations over 13 weeks, including sources,
hidden-scope sentinel data and incomplete/stale cases. Measure 100 successful calls
per class (roster/detail/match/operations/confirmation), five concurrent clients,
representative page/payload sizes, after 10 warmups/class. Report p50/p95/p99, query
counts and failures; each p95 ≤2000ms and zero correctness failures. Do not optimize
by removing current actor/source checks, reducing the fixture or timing only SQL.

`staffing:recovery:check` uses an owned matching database/workforce/artifact/eve pair,
restarts the local app/worker, and proves exact decision receipts, partial import
lease recovery, no second paid advisory turn and current source/role denial. Do not
restore a mismatched workflow store or erase it to obtain a pass.

`staffing:ui:check` runs the full four-project WebKit matrix from staffing-ui.md.
`eval:staffing` and its output-review verifier implement advisory-context.md's eight
actual-output cases and budget. CI runs deterministic tests/build/docs and isolated
UI, with no model key; live evidence remains local and opt-in.

## Evidence to record

The implementer creates `validation.md` with exact commands, target type/marker,
commit/code state, test counts, failures/fixes, timings, live usage/rubric result,
cleanup proof and Preview pre/post state. Redact credentials, private names, rates
and personnel content. Update tasks only for demonstrated behavior; a unit mock,
local smoke or passing focused file cannot stand in for the complete feature gate.
