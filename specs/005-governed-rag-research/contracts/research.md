# Public research contract v1

## Admission and UX

`POST /api/research/requests` creates a private preview bound to one authorized
customer and owned conversation. Input contains mode and typed public fields,
not arbitrary prompts. Recon uses explicitly confirmed public name/domain;
practices uses product/version/topic; fit selects governed customer/shared evidence.
Optional supplied URLs are labeled user submissions and remain Pending.
`GET /api/research/requests/:id` returns the owner's safe preview/state.
Editing via `POST /api/research/requests/:id/revisions` creates a new draft digest.

The server renders finite queries from versioned templates and displays the exact
outbound text, destinations/provider, permitted follow-up fetch scope, limits and
origin treatment. Private profiles/uploads/history never populate public fields.
Public identity confirmation does not approve a customer fact. A public topic
free-text field must reject likely secrets/credentials and non-public metadata;
positive public-field scope plus human preview is required, not a redaction guess.

`POST /api/research/requests/:id/start` includes expected revision/digest and
idempotency key. In one database transaction, reauthorize, admit the immutable
scope, reserve one research run and insert one owned conversation attempt/outbox
binding using existing dispatch semantics. Dispatch outside the transaction uses
the same existing request key. A crash may reconcile that one attempt; it never
admits another run. An admission must be consumed within five minutes or expire.
The run's 120-second execution deadline starts on consumption.

`GET /api/research/runs/:id` exposes safe progress, usage, retained eligible
citations and terminal reason. `POST /api/research/runs/:id/cancel` is owner-only,
idempotent, prevents subsequent egress/context release and retains valid completed
observations under current source policy. No raw response bodies or private URLs
from another user's run are exposed. Routes use session/CSRF/opaque error rules.

## eve boundary and roles

`propose_research` creates a preview without egress; the user starts it.
`research` is a `defineWorkflowTool` consuming only the server-admitted request ID
from the bound turn. Mode/scope/deadline are server-loaded; forged model arguments
cannot change them. Mode `recon` collects identity-scoped public observations;
`practices` collects public product/version evidence; `fit` has no network tools
and returns eligible context/prerequisites/gaps for root Turi synthesis.

The specification's bounded child research means a new visible proposed request
requiring user start, not a hidden child model or automatic egress delegation.
Keep built-in web_search/web_fetch/agent disabled. Keep root generation model.
Workflow bodies orchestrate; network, database, environment, random and clock
side effects run in replay-safe steps per installed eve documentation. No DB
transaction stays open across network calls.

## Budgets and failure semantics

| Boundary | Limit |
| --- | --- |
| Run | 120 seconds wall time after consumption; no deadline extension on replay |
| Active research | One run/principal, two/workspace |
| Admission rate | 10/hour/principal and 30/hour/workspace |
| Discovery | ≤4 Context.dev Search calls, ≤5 retained result URLs/call; 15 seconds/call |
| Fetch | ≤8 attempts total, ≤2 concurrent; 10 seconds/attempt |
| Redirects | ≤3/attempt; validate each target and charge bytes/time across chain |
| Response body | ≤2 MiB/document, ≤8 MiB/run including decompressed bytes |
| Normalization | ≤100,000 characters/document; inert HTML/plain text only |
| Retained result | ≤8 passages, ≤2,000 characters each; total DTO ≤24 KiB |
| Fetch retry | At most one retry for transient idempotent GET, within eight attempts |
| Paid search retries | None automatically; ambiguous outcome is unconfirmed |

Reserve operation and budget before dispatch, persist dispatched marker before
network egress, then save terminal receipt. Replay returns completed receipts.
A crash between marker and response is conservatively unconfirmed even if the
provider never received it. New user-requested retry gets a fresh admission and
budget. Provider 429/5xx/timeout, blocked URL, auth wall, cancellation and exhausted
budget produce safe explicit codes; completed applies only when planned work
finishes. Partial means some valid retained evidence and incomplete work;
unconfirmed takes precedence when paid usage/outcome cannot be reconciled.
Cancellation cannot recall an already dispatched provider operation, but no new
step or output may pass the current cancellation fence.

## Discovery, fetch and trust

Direct Context.dev Search adapter uses server-only `CONTEXT_API_KEY`; missing configuration means
unavailable. Queries are exactly admitted strings. Do not ask a model to invent
provider queries. Discovered URLs must match the admitted identity/topic policy;
every fetch gets its own server receipt. No cross-workspace body cache in 005.

Only public HTTPS/443; reject userinfo, local/private/reserved/multicast/metadata
and IPv4-mapped private destinations. Resolve and validate every DNS answer, pin
the chosen public IP for connection, and preserve TLS hostname validation. Reapply
on redirects, including canonicalization and redirect alias origin. Never forward
cookies, authorization, arbitrary caller headers or credentials. Enforce content
type/decompressed byte/deadline limits, no JavaScript, styles, frames, forms,
browser, binary document execution or authenticated access. Fetch robots/access
denials are visible blocked outcomes, not bypass opportunities.

Normalize inert content with source offsets; retain exact selected quotations,
body/passage digests, source URL/aliases, response type, dates and their provenance.
All source instructions are inert evidence. Search snippets alone are unusable.
User-supplied URLs, redirect aliases and same-content mirrors remain user-origin
within the request/customer provenance graph. Matching a submitted source via a
search result does not make it independent corroboration. Use URL aliases,
normalized digest and declared syndication groups conservatively; unknown
independence earns no additional corroboration. Truly separate discovery creates
a separate receipt and never rewrites the submission's origin.

Verified ingest requires admitted scope, current customer authority, canonical
identity, independent origin, network/content checks and exact passage match.
Only attributed verbatim observations may attach automatically; supplied-origin
or paraphrased content goes through existing Pending review. Keep the existing
synthetic-fixture ingest literal and tests unchanged. Official product-authority
rules are a versioned allowlist of domain/product/claim-type: R=4 only for exact
official product behavior, otherwise R=1 pending steward rating; D=4 only for an
exact quote, C from verified independent groups, F from quality-v1. Marketing
cannot prove private deployment/savings/terms or accepted internal customer facts.

## Required evidence

Three modes, admission/dispatch race, scope tampering, cancellation/revocation,
timeouts after dispatch, replay, missing key, query capture, SSRF/DNS/redirect and
decompression fixtures, origin laundering/syndication, exact support and quality,
plus actual bounded public-provider runs and reviewed Turi output. Deterministic
fixtures cannot establish real research or model behavior.
