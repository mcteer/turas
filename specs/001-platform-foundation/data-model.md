# Conceptual data model and state boundaries

This is a planning contract; 001 creates no runtime schema. Each future feature
defines exact fields, migrations, indexes and API contracts. All private entities
carry environment/workspace scope, stable identity, ownership/classification and
created/updated metadata. Revisions preserve provenance and authorized audit.

| Domain | Entities and relationships | Core validation / lifecycle |
| --- | --- | --- |
| Access | Principal, workspace membership, partner organization, customer/project grant, role policy | Verified principal; expiring/revocable scoped grants; no wildcard partner access |
| Customer | Customer, canonical alias, workload, stakeholder, product usage | Resolve aliases explicitly; usage requires cited evidence and scope/date |
| Maturity | Rubric version, scoped assessment, dimension state, next milestone | Separate from delivery stage; cite evidence and retain Unknown/history |
| Context | Submission, claim, source, source revision, review decision | Pending → accepted/rejected; correction creates revision; retraction/supersession invalidate use |
| Artifacts | Artifact version, extraction run, chunk, structured row, embedding index entry | Digest, MIME, size, origin, page/sheet/cell lineage; uploaded → quarantined → processing → ready/partial/failed |
| Research | Research request/run, retained passage, quality assessment, conflict set | Authenticated scope, bounded run, exact citations and rubric version; complete/incomplete/unavailable |
| Planning | Plan revision, technical design, acceptance decision, context snapshot | Draft → in review → accepted/rejected; accepted revision immutable; later revision supersedes explicitly |
| Delivery | Engagement, work package, milestone, deliverable, RAID item, change request, handoff | Customer + accepted plan; stage gates require evidence and decision owner |
| Operations | Engineer/partner resource, skill, competency assessment, availability, allocation, time entry, rate/cost policy | Approved dated skill levels; tentative/confirmed/released allocation; time draft/submitted/approved/returned |
| Reporting | Report definition, generated version, audience projection, recipient policy, delivery attempt/receipt | Draft → reviewed → approved/published; sending tracked separately; exact period/version/recipient digest |
| Growth/support | TAM recommendation, expansion hypothesis, disposition | Proposed → qualified/deferred/dismissed; claims remain evidence-linked, no implicit sale |
| Product feedback | Product gap, canonical duplicate group, customer impact link, engineering handoff | Unique customer per canonical gap; confirmed/suspected/resolved impact separated |
| Learning | Reuse contribution, practice version, evaluation run, publication decision | Candidate → reviewed → evaluated → published/withdrawn; source changes invalidate eligibility |
| Audit | Decision/event, idempotency record, outbox work item | Actor/scope/object/version/reason/time; replay cannot repeat a committed effect |

## Cross-domain invariants

- Accepted plan belongs to exactly one customer/workload scope and links its evidence
  snapshot. Acceptance cannot create duplicate engagements or confirm staffing by accident.
- Artifact upload does not approve extracted claims. Draft context stays out of
  accepted-fact retrieval even when vector similarity or quality is high.
- Competencies are structured approved records; vector search may find candidate
  evidence but cannot override skill level, dates, region or capacity constraints.
- Research evidence retains original origin. Fetching a user's link is still user
  submission processing, not independent discovery that bypasses review.
- Correction/retraction revokes current eligibility immediately; asynchronous index
  or cache updates may lag, so reads revalidate against authoritative revisions.
- Published reports retain their exact content and audience. A correction creates
  a new report/notice; it does not silently modify what recipients already received.
- Reuse across customers requires a separate publication grant and minimized data.
- All aggregate counts honor audience policy and canonical entity deduplication.
- Monetary values carry currency, source and defined precision; hours and percentages
  have explicit denominators and periods. Missing/zero inputs remain distinguishable.
