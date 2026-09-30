# Delivery plan — `delivery-plan-v1`

Feature 006 stores `plan-content-v1` as an immutable revision. Ten sections are
editable. Evidence and decision sections are assembled from governed source and
review records; they are not free-text approval claims. A draft can keep an
unknown or a reasoned not-applicable section. Submit and acceptance apply stricter
readiness checks.

Required metadata: plan/revision ID, workspace/customer/workload, audience, owner,
template/content schema version, as-of time, content/context digest, source
generations, review state and author. An engagement link exists only after
acceptance.

1. **Executive charter:** customer problem, desired capability, sponsor, operating
   owner, baseline, target, measurement method and outcome-review date.
2. **Current state and maturity:** workload/architecture, product use, dimension
   assessment and sources; constraints, assumptions, conflicts and discovery gaps.
3. **Scope and acceptance:** in/out, deliverables, measurable functional and
   operational acceptance, dependencies and customer responsibilities.
4. **Options and recommendation:** why this approach fits; alternatives, tradeoffs,
   current product/plan/region qualifications, and reasons to stop or defer.
5. **Technical design:** context/container diagram; components, data flows and
   interfaces; identity/access, data classification, migration, environments,
   performance/capacity, security, observability, testing and rollback. Link detailed
   designs/ADRs/prototypes rather than burying them in chat.
6. **Delivery work plan:** phases and work packages with owner role, effort range,
   dependency, milestone, exit evidence and customer validation. Include value-proof
   and production-readiness work from the beginning.
7. **Staffing and effort:** required skills and capacity assumptions, role-based
   owners and effort ranges or explicit unknowns. Do not name assigned staff,
   approved rates, prices or commercial commitments.
8. **RAID and decisions:** risks, assumptions, issues, dependencies, owners, due
   dates, mitigations and escalation/change-control thresholds.
9. **Enablement and handoff:** learning objectives, what/how/why explanations,
   customer/partner checkpoints, runbooks, support owner and independence evidence.
10. **Measurement and learning:** baseline-to-outcome review, adoption, quality,
    actual effort, product gaps and candidate reusable practices.
11. **Evidence appendix (derived):** claim-to-original-source revision and locator,
    generation, digest, quality and unresolved questions. Citations are resolved and
    rechecked by the domain layer; model prose cannot approve a source.
12. **Decision (derived):** accept, request changes or reject with reviewer, exact
    revision/digest, preview, time and rationale. Delivery acceptance requires an
    explicit suitability attestation. It creates or versions an internal engagement
    milestone baseline; it is not customer sign-off, staffing approval or a quote.
    Subsequent changes require a new immutable revision and explicit review.

Structured content also carries assertions with evidence references, context and
container diagrams with text equivalents, design decisions with alternatives and
rollback, work packages, milestones with stable keys and exit evidence, and a
six-dimension fit assessment for any reused solution. Historical source loss
withholds the affected body until the source is eligible again or the payload is
purged; an accepted identity remains auditable.
