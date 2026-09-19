# Turas interview demo

Turas is a synthetic weekly operating review for a new FDE/PS organization. It answers one first-90-days question: **where should the team intervene this week to protect a customer outcome and fixed-fee contribution without overcommitting a constrained skill?**

## Fixed scenario

- Reporting date: 18 September 2026
- Data version: `2026-09-19.2`
- Workspace: `synthetic-interview-demo`
- Customers: fictional Alderwick Labs, Brindlepath Software, and Morrowfen Media
- Engagements: four fictional engagements, including the Alderwick pilot exception
- Team: three fictional FDE/PS delivery roles

All names, evidence, staffing figures, costs, fees, and outcomes in this financial scenario are invented for this exercise. The separate Customer evidence view contains dated public Vercel sources; see [CUSTOMER_EVIDENCE.md](CUSTOMER_EVIDENCE.md). The delivery method is a proposed operating model, not a claim about Vercel practice or performance.

## Three walkthrough paths

1. **Operating review.** Open Portfolio review, select the Alderwick pilot exception, and compare the baseline 80 remaining hours with the proposed 40-hour enablement intervention. If the 40 hours replace the 80-hour forecast, the deterministic model improves forecast contribution from $17,000 (28.33%) to $22,000 (36.67%).
2. **Capacity exception.** Show that Avery has only four schedulable Enablement lead hours after committed and protected time. This makes the intervention a decision about skill capacity, not a generic pool of spare hours.
3. **Unknown evidence.** Open the Morrowfen discovery engagement or ask Turi about a real company such as Notion. Real-company names do not resolve to the fictional portfolio. Notion resolves to dated public stories, while its internal engagement remains unavailable. The correct response cites those stories and requests an internal source for a handoff; it does not invent engagement history or initiate connector setup.

Version `2026-09-19.2` replaces real-company-like display names and removes their aliases. Existing account, engagement, and evidence IDs remain stable to preserve bookmarked URLs and decision references; their legacy words do not identify real customers. No database migration is needed. Older chat transcripts remain historical and may show the misleading names; Turi must treat those statements as invented, not current customer evidence. Reverting this release would restore the misleading aliases, so any rollback must retain the corrected names and evidence-boundary instructions.

## The one permitted action

An owner may approve, reject, or defer the proposed intervention for `eng-notion-pilot`, with a rationale. This updates only the synthetic decision log. It cannot change a customer system, assign real staff, create a commercial commitment, or send a message. The action checks the scenario version and a duplicate key; a stale scenario requires a fresh review. Atomic, tenant-scoped idempotency remains a production hardening requirement, as documented in [EVIDENCE_AUDIT.md](EVIDENCE_AUDIT.md).

## Reviewer capability profile

The root agent can read the fixed fictional portfolio, engagement, capacity and what-if records, plus the separately maintained public customer inventory and source evidence. It can request a narrowly scoped implementation-research specialist and can request approval for the single synthetic action. Browser automation, shell access, file writes, unrestricted web research, root-copy delegation, and live external connections are absent from reviewer sessions. The effective surface can be checked with:

```sh
node --env-file=.env.local node_modules/eve/bin/eve.js info --json
```

## Presentation flow

The Services operating plan page (`/operating-model`) adds annual payroll, overhead, pricing, and utilization sensitivities; these are independent proposed assumptions, not an annualization of the engagement fixtures.

1. Sign in and frame the weekly P&L decision.
2. Show the portfolio exception and the engagement evidence.
3. Explain the deterministic economics, capacity constraint, and assumptions.
4. Ask Turi for the grounded brief and, if useful, the cited research proposal.
5. Approve, reject, or defer the synthetic intervention and show the audit result.
6. Open Memo & architecture for the 30-day validation plan and product choices.
