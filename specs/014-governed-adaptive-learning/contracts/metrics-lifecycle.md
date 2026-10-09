# Metrics, Privacy and Learning Lifecycle

Versions `learning-metrics-v1`, `learning-evaluation-v1`; preserve
`evidence-quality-v1` and the existing shared-reader contract.

## Fixed comparable measurements

A measurement is a private proposal grounded in an exact accepted 008 observed
outcome and original evidence. Report narrative, gap counts and partner training
attempts are not measurement values. Protocol mapping cannot accept new factual
values: every value, window, population and workload field needs an exact currently
accepted source locator. If existing evidence does not establish it, contribution
remains ineligible until ordinary factual review supplies sufficient evidence.

Ship two fixed protocols, no custom builder:

| Metric / protocol | Definition and unit | Aggregation within one customer |
| --- | --- | --- |
| `deployment_lead_time` / `deployment-lead-time-v1` | Mean minutes from a committed change to successful Production deployment, over all qualifying deployments in the predeclared workload population | Accepted total elapsed minutes divided by accepted deployment count for each window; no average of workload averages |
| `change_failure_rate` / `change-failure-rate-v1` | Percentage of Production deployments causing an accepted rollback, emergency remediation or service impairment within 24 hours | Failed deployments divided by all qualifying deployments across the same predeclared workloads; each deployment counted once |

Both compare the first 14 days and last 14 days of the same completed UTC calendar
quarter, using half-open UTC windows. Failure-rate release waits an additional
24 hours after quarter end for the attribution window. Lead-time measurement has
no extra attribution lag. Eligibility cutoff is evaluated server-side; no client
clock or partial current-quarter release. Populations must use the same inclusion
rule in both windows. Unobserved events, unverifiable selection or missing complete
population evidence make the contribution ineligible. A deployment count of zero
means unavailable, never a zero lead time or zero failure rate.

Use C09–C10 input bounds. Totals in minutes use exact decimal strings and integer
arithmetic. Compute each customer's current minus baseline; rate change is percentage
points. Compute the unweighted arithmetic mean of eligible customer changes using
exact rational arithmetic, round final display to 2 decimal places with halves
away from zero. Do not round intermediate rates or customer changes. A lower value
is favorable for both metrics, but never assert the change was caused by a service
or product. Report the signed change and fixed definition, not relative uplift.

One canonical customer counts once. Identical duplicate evidence is idempotent;
conflicting eligible submissions disqualify that customer until the conflict is
reviewed before first release. Approved corrections cannot silently select the most
favorable workload. Cohort rules are independent of customer maturity and engagement
stage, and never alter them.

## Release privacy

Internal-only, fixed metric and completed quarter; C11. Lock a workspace-wide
`metricId + quarter` family independent of protocol version, actor, session, API
route and query syntax. No arbitrary filters, intervention buckets, rolling windows,
complementary totals, exact contributor counts or customer drilldown from aggregates.
At least five independent eligible customers with explicit measurement reuse approval
are required. This threshold does not apply to a sanitized individual practice.

Before first numerical disclosure, freeze the exact participant/source/approval
manifest and formula/protocol versions. Identical reads replay that release only
while every dependency remains eligible. Source correction/withdrawal, material
conflict, expiry or rights revocation withholds the whole family synchronously.
No replacement numeric output is allowed for that metric/quarter, even through a
new protocol version, changed actor or newly added customer. Tombstones remain after
payload cleanup. A new quarter may release under its own independently eligible
fixed population. This conservative design limits differencing; it is not a claim
of differential privacy or protection from every possible outside dataset.

## Quality and due work

Keep three views separate:

- Evidence: current publication eligibility, conservative quality components/band,
  freshness, conflict, earliest validity deadline and safe withholding reason.
- Evaluation: exact candidate/baseline and fixture/rubric identity, required versus
  executed/reviewed/failed/missing cases and current release eligibility.
- Operations: due work, completed/failed/cancelled jobs, oldest overdue age, cleanup
  backlog and latency buckets, without customer/partner/source names in labels.

Reuse `Q = round(25 × (0.40R + 0.30F + 0.20D + 0.10C))` and the policy's existing
freshness windows. Review, refresh, rollback and retrieval never reset original
claim dates. Stored dashboard snapshots cannot confer eligibility. Scope private
queue counts to the current internal reader; never combine them with aggregate
families to reveal their hidden membership or omission counts.

Use existing maintenance supervision and research admission. Mark due records and
create deduplicated review work without an external call. If an operator explicitly
admits external refresh through 005, retain original query/customer/actor/scope and
budget boundaries; changed content creates proposed review work and no automatic
approval, improvement draft or publication. A draft is separately admitted under
its explicit operation budget. C12 bounds work/retries and C13 bounds retention;
source-access changes are checked at dequeue, dispatch and completion.

## Acceptance and operations

The canonical suite manifest must enumerate contracts, domain, native, UI, recovery,
regression, performance and actual-output verification. Owned local runners use
synthetic data, production quotas and unchanged model configuration; they do not
reset quotas to force benchmarks through. Seven SC-006 classes each run at least
100 operations with p95 under 1000 ms, external calls excluded and reported separately.
Use multiple synthetic actors/scopes and lawful pacing for quotas.

Required recovery: empty→054 and populated051→054, runtime grants, schema/env
mismatch, activation legacy-head capture, an old publication writer after activation,
kill/restart during paid admission and family release, workers stopped during
revocation, native reset failure/retry, same database/private state preserved, and
cleanup on exit/signals. Remove only owned containers/volumes/workers under ignored
`local-artifacts/014/`; no sibling `turas-*` checkout.

Release steps: verify live target/commit/schema; take a private backup and rehearse
restore/forward migration; apply 052–054 and runtime grants in additive order;
deploy authorized code; activate the gate explicitly; validate authenticated HTTP
and CLI WebKit in Production. Verify published knowledge reads, blocked unevaluated
publish, feedback, private review/dashboard and partner denial using authorized
accounts and designated test data. Do not create fake outcomes in real customer
records. Record credentials/checks unavailable as incomplete hosted acceptance.

Disable new learning work while existing eligible shared reads, withdrawal,
reconciliation and cleanup continue. Do not reset gate, family or cost ledgers and
do not downgrade schema. Restore old practice wording only through reviewed rollback;
restore infrastructure backups only as an explicit recovery operation coordinated
with intervening writes. Do not point generic disposable runners at Production.
