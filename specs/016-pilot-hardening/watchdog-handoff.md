# Production watchdog handoff repair

## Scope and acceptance

Governed by FR-002, FR-018, FR-021 and FR-024 and task T265. Repair the observed
minute-boundary maintenance gap without weakening freshness, authorization,
recovery, lease or accounting checks. No schema/grant, model, customer-record,
firewall or automatic-deployment changes are included.

A Production watchdog currently stops after 65 seconds. Cron arrives nominally
every minute, but successor cold-start/scheduling delay can exceed the five-second
overlap. Critical maintenance requires completed observations within six seconds.
A 12-probe authenticated Production sample observed healthy service followed by
stale artifact/workforce maintenance at consecutive minute-boundary probes, then
recovery on the next invocation. This is intermittent availability, not merely
missing idle storage/image assurance.

Keep Production lanes alive for 125 seconds (two nominal cron periods plus five
seconds), within the hosted Function lifetime. Independent durable per-class
leases continue to fence overlapping workers. Preserve the Preview lifetime of
180 seconds, batch limits, tick deadlines, per-lane non-overlap and stop/drain.
This tolerates a bounded delayed successor; it does not promise availability
through arbitrarily missed cron invocations or hide actual worker failures.

Acceptance: a controlled successor arriving at 80 seconds must leave no gap longer
than the existing five-second conversation tick; all timers must drain. Existing
Preview, authentication, independent cleanup and cancellation retry tests remain.
Run exact-source CI and authenticated Preview checks, merge without bypassing
protection, explicitly deploy the merged source, and observe canonical Production
readiness over multiple actual minute boundaries. Rebuild the existing independent
backup operator from that same final source, preserving configuration, keys,
archives, budgets and its 12-hour schedule. Do not relabel earlier backup samples.

## Actual evidence and remaining gates

- The new delayed-successor regression fails on the original 65-second worker:
  maximum gap 20,000 ms versus the unchanged 5,000 ms limit.
- With 125-second Production lifetime, watchdog and hosted-dispatch tests pass:
  14 tests in two suites. Preview's 180-second lifetime and timer cleanup pass.
- CI, final-source Preview and post-merge Production handoff acceptance remain
  pending for this code change.

## Related operational work retained separately

Before this code repair, the merged glob patch source was explicitly deployed.
Existing account passwords were updated from the maintainer's corrected local
configuration and real three-role WebKit logins passed. Scanner signatures were
actually refreshed to version 28179, and clean/EICAR local checks returned 0/1.
A scope-bound replacement Sandbox budget retained the old reservations and full
committed ceilings, reduced available authority to the unspent $19.82 and 220
remaining dispatches, and kept the original November 30 expiry. No spend expansion
or unknown-cost release was performed.

The old CLI deployment fallback was found to report source 0148c517 despite
uploading the merged application. Production TURAS_CODE_VERSION now names the
actual uploaded source; old-version evidence is not transferred. The independent
active backup package was rebuilt for that source without recreating retired
projects. Final-source backup provenance remains a separate gate.

Actual current-source Production WebKit uploads passed through the ordinary
private artifact and workforce workflows. Scanner/parser Sandbox jobs succeeded
with provider identities and verified outputs; original bytes matched exactly.
Artifact deletion and conversation archival were observed. Workforce extraction
created no accepted competency, personnel, mapping or review records; its source
was withdrawn through its normal lifecycle. Four storage namespaces have genuine
current-source observations. No test workspace or accepted customer fact was made.

Production contains zero engagements and zero reports. Renderer/report and gap
export assurance cannot be asserted from those upload checks. Do not fabricate
accepted baselines, report publication or customer impact records merely to turn
all six namespaces and three images green. Applicable positive domain acceptance
requires a real authorized scope. This is distinct from the watchdog repair and
from ordinary service availability.

Private receipts remain under ignored local-artifacts/production-readiness.
No claim of full infrastructure assurance, new scheduled-capture success or
physical provider deletion is made by these checks.

## Rollback and operations

Rollback the application commit if the overlap repair fails; no database rollback
is required. The old worker restores the observed handoff risk and is not a fix.
Preserve the current password records, fresh immutable scanner, scoped budgets,
accounting history and all recovery custody during any deployment rollback.
Scanner signatures still require genuine renewal within seven days of their build,
and the finite budget retains its original expiry. No timeout or signature-age
extension is part of this repair.
