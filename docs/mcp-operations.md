# Read-only MCP operations (015)

015 merged in [PR 28](https://github.com/mcteer/turas/pull/28). Production is enabled on schema 055 with runtime grants after authenticated SDK/HTTP/CLI WebKit checks, including actual research passages and citations. Protocol and research-locator corrections merged in PRs 29 and 30. Local/CI and hosted evidence remain separate. See the
[validation record](../specs/015-read-only-mcp/validation.md) for actual evidence.

## Compatibility and scope

The only external endpoint is POST `/api/mcp/v1`. The official server and test
client are pinned to 2.3.1 and protocol `2026-07-28`. Configure the client to
negotiate that protocol explicitly and supply a manual `Authorization: Bearer`
header. Clients requiring OAuth discovery, legacy initialization, sessions or SSE
are unsupported. This is not a universal client compatibility claim.

Connections are personal and individually revocable. Internal members and assigned
partners can select only currently visible customers and five categories: profiles,
evidence, shared knowledge, accepted plans and published reports. Knowledge-only
access needs no customer selection. A selected ceiling never expands automatically;
current membership, organization, assignment, source eligibility and publication
fences still apply to every read. Browser logout does not revoke MCP access.

The twelve fixed tools expose current accepted context. No conversations, workforce,
financial data, private learning lineage, aggregate customer statistics, approval,
research, models, embeddings, rendering, export, delivery or mutation tools exist.
Lists contain at most 20 entries and no totals; exhausted eligibility scans return
unavailable rather than silently omitting an unknown remainder.

## Credentials and management

Open Connections in the authenticated navigation. Select categories and customers,
review the scope and choose expiration (1–30 days, default 7). At most ten active
connections are allowed per member. The credential is held only in component memory
until dismissal and is available once through explicit Copy Credential. Store it in
the client's secret facility. Do not put it in URLs, tickets, logs or captures.

A lost creation response is reconciled with its original request UUID. The receipt
never recovers the secret; revoke the confirmed connection and create a replacement.
Changed UUID replay conflicts. Scope changes and rotation require revoke plus new
creation. Members manage their own connections; canonical mcteer can revoke workspace
connections. Revocation and reconciliation remain available while exposure is disabled.
Already delivered bytes cannot be recalled.

## Bounds, retention and disablement

`TURAS_015_DISABLED=1` is the default. Only `0` enables new connections and external
reads. Request bodies are limited to 16 KiB and complete responses to 128 KiB.
Authenticated requests, including malformed requests, consume durable UTC-minute
quotas of 30/connection, 60/member and 240/workspace. Concurrent reads are limited to
2/connection, 4/member and 16/workspace. HTTP 429 includes integer Retry-After
(1–60 seconds). The response deadline is ten seconds, SQL statement timeout five
seconds and lock timeout two seconds. There are no automatic retries.

Opaque hashed continuation/citation handles expire within fifteen minutes and bind
the exact actor, connection, scope, source revision and digest. Do not swap handles
between credentials. Metadata-only usage retains at most ninety days. The maintenance
worker deletes expired handles and leases in batches of at most 100 and purges
revoked/expired credential hashes within twenty-four hours. Permanent minimal
connection identities and exact create/revoke receipts remain; cleanup never revives
access. Audit excludes arguments, credentials, private prose, source locations and
customer names. Cleanup runs independently every thirty seconds in the local worker
and the protected hosted watchdog, including while exposure is disabled. An outage can leave usage incomplete; never replay a read to repair it.

## Validation and authorized release

Run the complete owned gates in the [quickstart](../specs/015-read-only-mcp/quickstart.md).
They create labelled disposable loopback databases and synthetic data, preserve root
Preview selection and workflow state, and clean only their owned resources. No paid
provider keys are needed. Development filters are not acceptance evidence.

Release requires separate authorization and all completed CI checks green. Before
changing the selected hosted target, record its exact environment/schema/deployment,
back up the database and rehearse restoring that backup to an isolated target. Never
print credentials or customer content. Keep exposure disabled, apply explicit migration
055 with `npm run db:migrate` and runtime grants with `npm run db:roles` using the
selected target's owner credentials, then verify the marker, migration ledger and
required runtime grants. Request handlers never migrate. Learning activation supports
verified schema 054 or 055 only; do not bypass its owner/environment gate.

Deploy the compatible disabled commit through eve using the already linked project;
verify the deployed commit, endpoint and disabled management behavior before setting
`TURAS_015_DISABLED=0` and applying the required deployment. Validate authenticated
HTTP, the pinned actual SDK and command-line WebKit against Production after merge.
Check owner and canonical administrator management, available internal and assigned
partner records, category/customer scope, revocation, current-source denial and safe
usage. Use disposable operator-owned credentials and revoke them afterward. Do not
create customer records or grants to make absent coverage appear to pass. Record
missing record-dependent coverage, exact deployment/schema identity and cleanup in
the validation record. Local mocks do not prove hosted behavior.

Rollback exposure by disabling and revoking credentials. Do not downgrade schema,
drop customer truth or reactivate revoked connections. After a successful merge,
delete its local/remote branch and verify README on main.
