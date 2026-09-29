# Shared knowledge contract v1

## Routes and services

| Route | Action / authority |
| --- | --- |
| `GET /api/knowledge` | Current published payloads, any active same-environment member; cursor ≤20 |
| `GET /api/knowledge/:id` | Current published revision, same public payload for all readers |
| `POST /api/knowledge/contributions` | Source-authorized member creates private draft |
| `GET /api/knowledge/contributions` | Own authorized candidates; admin review queue, ≤20 |
| `GET /api/knowledge/contributions/:id` | Author or admin, current source authority required |
| `POST /api/knowledge/contributions/:id/revisions` | Author or admin appends candidate using expected revision/digest |
| `POST /api/knowledge/contributions/:id/submit` | Author submits exact candidate to admin review |
| `POST /api/knowledge/contributions/:id/decisions` | Admin publish/reject using exact submitted revision and head |
| `POST /api/knowledge/:id/withdraw` | Admin withdraws exact published head |
| `GET /api/knowledge/contributions/:id/lineage` | Author/admin with current access to every source; never ordinary reader |

Every mutation uses existing session/CSRF controls, idempotency and expected
revision/digest. Implement in `lib/server/knowledge/{policy,service,read,lineage}.ts`.
Eve may propose private candidates using the same service; it cannot publish.
005 requires the UI authoring path; an extra publication tool is not required.

## Decision transaction

Publication checks current internal administrator authority, active source
workspace membership, access to all exact lineage revisions, transitive source
eligibility, reuse rights, sanitization rationale, current candidate/head and
idempotency key. Required review checklist explicitly covers names/domains,
repositories/links, personal/commercial details, identifying configurations and
outcomes, customer counts and inference from combined facts. Obvious direct
identifier matches block submission to publication; a reviewer must correct the
candidate. Automated checks assist review and cannot prove anonymization.

Rights attestation and all checklist decisions are persisted against the exact
digest. A concurrent edit/review returns 409; a matching replay returns the same
receipt without a second publication. Unauthorized/stale-source mutations commit
nothing. A former author/reviewer has no lasting capability. Admin self-review is
permitted and recorded honestly; peer review is not a new role requirement.

`draft → submitted → rejected/closed` governs the private contribution. Editing
a submitted/rejected candidate creates a new draft revision. Publication changes
`unpublished → published → superseded/suspended/withdrawn`. A correction creates
a new candidate and exact publication decision; no update-in-place of published
text. Source mutation causes immediate read-time ineligibility and later worker
materialization of suspension. A suspended/withdrawn revision is never silently
reactivated; republishing uses a new exact reviewed revision.

## Public projection

The DTO contains only stable shared ID/revision, title, product/version, problem,
prerequisites, solution, reasoning, applicability, limitations, validation,
publication/quality dates and public-safe component rationale. It excludes source
customer/workspace, author/reviewer identifiers, private links, lineage IDs and
counts. Dates must describe the public claim/review rather than expose private
customer event timing. Do not claim an independent support count derived from
private lineage. The reviewer authors a public-safe quality explanation validated
against restricted support; discovery caveats survive publication.

Cross-workspace shared access is intentional within one environment. Customer
source access is never inherited from reading a shared entry. Shared source detail
shows only the published payload/locators; review links appear solely after server
authorization. Older revisions are not ordinary reader endpoints. Reviewer audit
may retain permitted history after reauthorization and payload-retention checks.

## Independent acceptance

Cedar-only partner can search/cite a Juniper-derived publication and sees the same
public JSON as an internal member. Synthetic hidden identity/link/count sentinels
never occur in search, source view, errors or Turi output. Test another workspace,
inactive/environment-mismatched membership, admin revocation, source revision
race, reuse denial, duplicate decision, draft/rejected/withdrawn states and
lineage-based suspension while index cleanup is paused.
