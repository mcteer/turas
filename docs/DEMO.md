# Turas interview demo

Turas is a synthetic weekly operating review for a new FDE/PS organization. It answers one first-90-days question: **where should the team intervene this week to protect a customer outcome and fixed-fee contribution without overcommitting a constrained skill?**

## Fixed scenario

- Reporting date: 18 September 2026
- Data version: `2026-09-19.1`
- Workspace: `synthetic-interview-demo`
- Customers: fictional Notion Labs, LinearWorks, and Coda Collective
- Engagements: four fictional engagements, including the Notion pilot exception
- Team: three fictional FDE/PS delivery roles

All names, evidence, staffing figures, costs, fees, and outcomes are invented for this exercise. The delivery method is a proposed operating model, not a claim about Vercel practice or performance.

## Three walkthrough paths

1. **Operating review.** Open Portfolio review, select the Notion pilot exception, and compare the baseline 80 remaining hours with the proposed 40-hour enablement intervention. The deterministic model improves forecast contribution from $17,000 (28.33%) to $22,000 (36.67%).
2. **Capacity exception.** Show that Avery has only four schedulable Enablement lead hours after committed and protected time. This makes the intervention a decision about skill capacity, not a generic pool of spare hours.
3. **Unknown evidence.** Open the Coda discovery engagement or ask Turi about an unknown account. The correct response distinguishes missing evidence from an observed fact and requests a source note; it does not initiate connector setup.

## The one permitted action

An owner may approve, reject, or defer the proposed intervention for `eng-notion-pilot`, with a rationale. This updates only the synthetic decision log. It cannot change a customer system, assign real staff, create a commercial commitment, or send a message. The action is versioned and idempotent; a stale scenario version requires a fresh review.

## Reviewer capability profile

The root agent can read the fixed synthetic portfolio, engagement, customer-resolution, capacity, and what-if records. It can request a narrowly scoped implementation-research specialist and can request approval for the single synthetic action. Browser automation, shell access, file writes, unrestricted web research, root-copy delegation, and live external connections are absent from reviewer sessions. The effective surface can be checked with:

```sh
node --env-file=.env.local node_modules/eve/bin/eve.js info --json
```

## Presentation flow

For the ten likely panel questions, defensible numbers, follow-up challenges, and a timed walkthrough, use [Interview preparation](./INTERVIEW_PREP.md). The Services operating plan page (`/operating-model`) adds annual payroll, overhead, pricing, and utilization sensitivities; these are independent proposed assumptions, not an annualization of the engagement fixtures.

1. Sign in and frame the weekly P&L decision.
2. Show the portfolio exception and the engagement evidence.
3. Explain the deterministic economics, capacity constraint, and assumptions.
4. Ask Turi for the grounded brief and, if useful, the cited research proposal.
5. Approve, reject, or defer the synthetic intervention and show the audit result.
6. Open Memo & architecture for the 30-day validation plan and product choices.
