# Governed learning operations

014 adds private feedback, admitted Turi drafts, exact human-reviewed paired
release evaluations, accepted-source measurements and Learning Health. Internal
members propose; administrators review and publish. Partners receive only eligible
reviewed shared practices. Cross-customer metric releases remain internal, use
fixed quarterly families across protocol versions and require five independent
accepted customer populations. A released family cannot be replaced with a
corrected subset. Source or rights loss withholds it permanently.

## Schema and activation

Use Node 24. Required migrations are 052–054 after schema 051. Never initialize
or migrate in a request handler. Before an authorized hosted release, privately
back up the exact selected target and rehearse restoring and applying the complete
checked-in manifest in an isolated database. Verify the environment marker,
predecessor records, migration hashes and runtime grants. Keep backup files and
URLs out of logs and Git. Run `npm run db:init` and `npm run db:roles` with the
explicit migration-owner connection and the selected target environment; verify
schema and migration ledger both reach 54 before deploying compatible code.

New workspace state is provisioned disabled by migration 054. Activation is an
operator transaction, never a runtime capability:

```sh
node --import tsx scripts/learning-activate.ts --activate --workspace <workspace-uuid>
```

Supply `DATABASE_URL_UNPOOLED` and `TURAS_ENVIRONMENT_ID` privately. The command
requires the table owner and exact schema 54. It snapshots currently eligible
legacy publication heads once while locking publication writes, then enables new
work. Deploy compatible code before activating any workspace. Old writers cannot
advance gated publication heads. Repeated activation preserves the original
snapshot. To stop new work without undoing the gate, use the same command with
`--disabled`. Reads still require current authority and eligibility; withdrawal,
reconciliation, unknown-cost holds and cleanup continue. Do not restore an old
writer against an activated gate. Recovery is forward through reviewed migrations.

## Admission, accounting and review

Preserve `agent/agent.ts` model selection and admission. Actual evaluations use
Grok 4.7 with the existing reasoning setting, eight fixed baseline/candidate pairs,
fresh native sessions and zero tools. Every provider dispatch reserves a verified
full input/output ceiling, including reasoning and the most expensive applicable
pricing tier. Pricing is fetched from public Gateway metadata; an optional
`TURAS_014_PRICE_CONTRACT` must meet the bounded, verified contract in
`lib/server/learning/pricing.ts`. Missing price, uncertain dispatch or unknown cost
blocks further calls. A conservative bound is distinct from confirmed actual cost.
No paid automatic retry, selective arm replacement or budget reuse for a rerun.

Actual-model acceptance requires fresh explicit operator authorization:

```sh
TURAS_ALLOW_LIVE_MODEL_TESTS=1 npm run eval:learning -- --live --budget-usd 25
npm run learning:review:verify -- --capture <private-capture-path> --review <private-review-path>
```

The authorization caps the entire operation. After reviewing a failed evaluation,
a manually admitted new complete revision may use a fresh budget account within
the remaining original authorization. Retain all prior charges and ensure aggregate
confirmed spend plus the new budget cap remains within that authorization. Unknown
cost or dispatch still blocks admission; there are no automatic paid retries.
Captures and raw accounting remain ignored
under `local-artifacts/014/`, with private permissions. An independent reviewer
must assess all eight actual pairs against the fixed rubric, exact citations,
unknowns, authority boundaries and forbidden actions. The verifier binds source,
model, fixtures, output and accounting hashes. Structural or synthetic-provider
checks do not establish actual model fidelity. Product administrators must still
make each exact release decision; evaluation acceptance never publishes by itself.

The acceptance CLI reports `featureVerdict` separately from `publicationVerdict`
and `publicationPermitted`. Complete independently reviewed actual pairs may
establish feature proof when safe, at least 7/8 per candidate and nonregressing,
even if no scored benefit is demonstrated. Such a comparison correctly returns
publication `failed` and cannot publish. Runtime publication and per-practice review
retain every improvement threshold; a feature pass is not release permission.

## Retention and maintenance

Local maintenance and the protected hosted watchdog use the same governed domain
functions. Every tick is bounded by 100 records and ten seconds. Exact native
reset retries use 1, 5 and 15 minute delays, then operator review. Finished eve runs
have zero payload retention; governed captures remain in the domain store until
their own deadline. Native payload purge requires an exact reset receipt.
Obsolete private payloads expire within 90 days; globally invalidated payloads
within 24 hours of original source loss or an earlier captured deadline. Eligible
audit metadata is minimized after 365 days; content-free request tombstones remain
for the environment lifetime. Individual session loss fences that session without
revoking independently eligible published reuse. Preserve original source dates;
due review links only prepare existing research scope and require fresh normal
research budget admission and a separate drafting admission.

The optional `TURAS_014_RECEIPT_HASH_KEYS` key ring uses private keys of at least
32 bytes, newest first. If unset, the maintenance secret is used. Preserve all old
keys for the environment lifetime so expired request tombstones remain recognizable.
Do not rotate away required keys.

## Validation and hosted acceptance

Canonical local commands are `test:learning`, `learning:native:check`,
`learning:ui:check`, `learning:recovery:check`, `test:learning:regressions`,
`benchmark:learning`, `typecheck:learning` and `build:learning:check`.
CI runs complete registered inventories with no skipped or empty suites, all four
WebKit configurations, real eve with a synthetic provider, empty/051 recovery,
seven 100-operation performance classes and earlier-feature regressions. Owned
runtimes live inside this checkout and remove only their own resources. Preserve
root `.env.local`, the selected database and `.eve/.workflow-data`.

After an authorized merge/deployment, verify the actual deployed commit, schema54,
ledger and grants. Use eve for Vercel operations. Authenticate to Production and
check Learning feedback, candidate review, evaluation summaries, measurements,
metrics, due handoff and health with HTTP and command-line Playwright/WebKit.
Check internal member/admin authority and partner denial with actual credentials;
record unavailable role coverage honestly. Verify Product Gaps and Partner Delivery
still load without server errors. Exercise disabled reads and cleanup safely;
never generate paid advice or publish a synthetic practice in Production as a
smoke test. Record actual results and deployed identity in the feature validation
record. Local fixtures and green CI are not hosted proof. After successful merge,
keep the PR closed, remove its feature branches and verify README on main.
