---
name: engagement-health-and-risk
description: Use when assessing, explaining, triaging, or monitoring the health of a Vercel FDE/PS engagement; identifying delivery or customer-outcome risk; preparing a risk-to-action brief or portfolio review; or recommending an escalation, mitigation, owner, or decision.
---

# Vercel FDE/PS Engagement Health and Risk

## Purpose

Use this skill to turn authorized engagement evidence into an explainable, time-bound risk-to-action view. Turi uses it inside Turas to help Vercel FDE/PS, Customer Success, account, and leadership teams understand what may prevent a customer outcome, what is already wrong, and what decision or intervention is needed next.

Engagement health is a decision aid, not an account label, renewal prediction, utilization report, color code, or automated escalation engine. Its purpose is to protect the customer outcome, safe delivery, customer ownership, and sustainable team capacity.

Assess a defined engagement, customer workflow, milestone, or authorized portfolio slice. Do not infer the health of an entire account from one project, one telemetry signal, plan type, executive sentiment, revenue, or an FDE's presence.

## Operating Principles

- **Start with the promised customer capability and outcome.** A schedule, deployment count, or feature checklist is only relevant when it affects the agreed workflow, acceptance criteria, operating ownership, or outcome measure.
- **Separate leading signals from outcome evidence.** Outcome measures show what has happened; diagnostic signals indicate where the underlying workflow may be drifting early enough to intervene. Link each signal to a plausible customer consequence and an action the team can influence.
- **Make every assessment explainable.** Show evidence, source, scope, freshness, confidence, reasoning, owner, and next decision. A health state without this context is not actionable.
- **Treat uncertainty as information.** Missing, stale, contradictory, or unauthorized evidence means the state is unknown or confidence is low - not necessarily that the engagement is healthy.
- **Distinguish risk from an issue.** A risk is an uncertain future event or condition that could affect the outcome. An issue is already occurring and needs active resolution. Do not hide an issue inside a probability score.
- **Protect customer ownership.** A mitigation should strengthen the customer team's ability to decide, operate, and sustain the result. Do not use risk management to justify indefinite FDE/PS dependency.
- **Use a small number of material signals.** Favor indicators tied to the engagement's success plan and current stage. More data does not create a better assessment if it obscures the decision.
- **Keep commercial and customer outcomes distinct.** Contract, renewal, and scope context may be relevant evidence, but Turi must not use a health assessment to make a commercial prediction or commitment without authorized commercial inputs and human ownership.

## Core Vocabulary

| Term | Meaning | Turi Must |
| --- | --- | --- |
| **Fact** | A time-stamped observation from an authorized source, such as an open dependency, missed milestone, support incident, adoption measure, or customer decision. | Cite it; do not reinterpret it as a conclusion without saying so. |
| **Signal** | A fact or trend that may indicate a favorable or unfavorable condition. | State why it may matter, how fresh it is, and what would confirm or refute it. |
| **Risk** | An uncertain event or condition with a plausible effect on a customer outcome, delivery gate, operating readiness, or team capacity. | Record cause, consequence, likelihood/impact rationale where known, owner, response, and review date. |
| **Issue** | A present problem already affecting delivery, customer experience, or operational safety. | Escalate through the appropriate operating path; do not describe it as merely a future risk. |
| **Dependency** | An external decision, resource, system, approval, or activity required for the engagement to progress. | Name the dependency owner, due date/decision date, and fallback or consequence. |
| **Assumption** | An unvalidated condition used to plan or decide. | Attach a validation action and date; promote it to a risk if its failure would be material. |
| **Decision** | A choice that changes scope, priority, acceptance, ownership, or response. | Record the decider, rationale, evidence, and resulting action. |

## Health Dimensions

Assess only the dimensions relevant to the requested boundary. A material assessment reports each assessed dimension separately; it does not average them into an opaque overall score.

| Dimension | Questions to Answer | Illustrative Signals (not a universal checklist) |
| --- | --- | --- |
| **Outcome and value realization** | Is the prioritized customer workflow still consequential? Is a baseline, target, and observation path credible? | Outcome measure absent or disputed; leading indicator deteriorating; customer value evidence; changed business priority. |
| **Delivery execution and scope** | Can the team reach the next agreed stage gate with controlled scope and an executable plan? | Unresolved design decision; critical-path dependency; repeated rework; unapproved scope change; stage-gate evidence gap. |
| **Customer adoption and ownership** | Are users, operators, and sponsors engaged enough to adopt and sustain the result? | Owner vacancy; missed enablement; absent operating/runbook owner; feedback from intended users; training/adoption evidence. |
| **Technical and operational readiness** | Are architecture, integrations, quality, security, reliability, support, and rollback requirements proportionate to the workload? | Critical integration failure; security/privacy review gap; evaluation failure; incident trend; observability or release-readiness gap. |
| **Stakeholder alignment and decisions** | Are the right customer and Vercel stakeholders engaged and able to make needed decisions? | Sponsor/champion change; conflicting priorities; decision overdue; decision rights unclear; persistent non-response in a decision-critical cadence. |
| **Capacity and delivery sustainability** | Does the team have the relevant capability and sustainable time to do the work without creating another avoidable risk? | Required expertise unavailable; excessive context switching/travel/incident load; unstaffed work; reliance on one person; handoff gap. |
| **Commercial, policy, and external context** | Are contract, procurement, legal, regulatory, partner, or customer-business conditions constraining the agreed outcome? | Procurement delay; policy exception rejected; customer reorganization; partner dependency; approved scope constraint. |

Do not treat low product activity, a quiet customer, high support volume, an approaching renewal, or a red/green indicator as conclusive on its own. Interpret it in the customer workflow, lifecycle stage, contractual model, and available qualitative evidence.

## Assessment Workflow

### 1. Set the boundary and decision

State the engagement/workflow/milestone or portfolio slice, intended audience, decision to support, observation window, and health-model version. Examples:

- “Should the customer support agent proceed from Prove to Promote?”
- “What requires leadership attention across EMEA engagements this week?”
- “Is the first production slice at risk of missing its agreed launch-readiness gate?”
- “What evidence is still needed to decide whether this engagement can move from Shape to Prove?”
- “Which dependency is most likely to prevent production readiness for the support-agent workflow?”
- “Which leading indicators suggest that the workflow is unlikely to achieve its adoption target?”
- “Has the customer’s business priority changed enough that we should revisit the engagement outcome?”
- “Which engagements appear stable only because their evidence is stale or incomplete?”
- “Where do we have a repeated dependency or security-review pattern that should become a reusable playbook?”
- “Which recurring risk should be addressed through enablement, an accelerator, or a product/platform improvement rather than another bespoke engagement?”

If the decision is unclear, ask for it or frame a narrow default: identify the next material risk and the evidence/action needed to resolve it.

### 2. Retrieve the minimum authorized evidence set

Retrieve only the records needed for that decision. Prefer sources that establish:

- customer outcome, baseline, target, acceptance criteria, named sponsor and operating owner;
- current delivery stage, milestones, critical dependencies, scope changes, decisions, and required stage-gate evidence;
- relevant adoption, workflow, quality, reliability, security, support, and operational evidence;
- stakeholder changes, customer feedback, and action/decision history;
- declared allocations, skills/coverage constraints, and approved capacity changes; and
- source time, freshness, provenance, access limitations, and known gaps.

For a maturity-dependent consequence, load `customer-maturity-journey`. For a delivery-stage, handoff, capacity, or plan assessment, load `delivery-methodology`. Use both where the engagement plan depends on the customer's maturity journey.

### 3. Classify what the evidence means

First identify whether each item is a fact, signal, risk, issue, dependency, assumption, or decision. Then state the connection to the outcome or stage gate. Do not turn correlation into causation, and do not turn a stakeholder's concern into a verified technical fact.

Use one of these operational states for the specific assessed boundary:

| State | Meaning | Required Response |
| --- | --- | --- |
| **Unknown / Insufficient Evidence** | Evidence is missing, stale, contradictory, or outside the requester's authorized scope. | Name the missing evidence and propose the smallest discovery or verification step. |
| **Monitor** | A weak, isolated, or low-materiality signal warrants a defined check but does not yet justify intervention. | Assign an observer/owner, confirmation condition, and review date. |
| **Needs Attention** | A validated signal or dependency could constrain the next milestone or outcome if not addressed. | Name an owner and a bounded mitigation or decision before the next relevant review. |
| **At Risk** | A material outcome, stage gate, safety/control, or customer-ownership condition is likely to be missed without a timely decision or intervention. | Escalate to the named engagement/customer owners; present response options, trade-offs, and a decision deadline. |
| **Critical Issue** | Harm, a material customer/production impact, a breach of a required control, or imminent failure is occurring or credibly imminent. | Invoke the established incident/escalation process and explicit human ownership. Turi may summarize and draft communications; it cannot declare acceptance, make commitments, or execute external changes without approval. |

These labels are not a universal numeric score. If Turas later implements a deterministic health model, its inputs, version, segment rules, thresholds, confidence, and calibration results must be visible alongside the state.

### 4. Form a risk-to-action recommendation

For each material item, create a concise record:

1. **Condition and Evidence:** what is observed, from where, when, and with what confidence.
2. **Customer Consequence:** the plausible impact on the agreed outcome, user experience, stage gate, operating ownership, or sustainable delivery capacity.
3. **Classification and State:** signal/risk/issue/etc. and operational state, with rationale.
4. **Owner and Collaborators:** the person or role accountable for the next response; do not assign them without approval.
5. **Response Options:** remove the blocker, reduce exposure, prepare a contingency, explicitly accept/defer, or gather targeted evidence. Show trade-offs.
6. **Next Decision and Date:** the decision needed, its accountable decider, and review/expiry date.
7. **Closure Evidence:** what would demonstrate that the item is mitigated, resolved, accepted, or no longer relevant.

Favor the smallest safe intervention. A useful response might be a discovery session, a security decision, a narrowed first slice, a customer-owner appointment, a revised acceptance criterion, or an explicit stop/reshape decision—not automatically more engineering capacity.

### 5. Close the loop and learn

At each engagement review, verify whether the condition changed, the agreed action occurred, and the closure evidence is credible. Never close a risk merely because its due date passed, a meeting occurred, or based purely on assumptions/hearsay.

For repeated risk patterns, record a field-learning candidate and route it through the delivery methodology's field-to-product disposition. A recurring risk may indicate a missing qualification criterion, playbook, accelerator, product improvement, enablement asset, or staffing capability.

## Cadence and portfolio use

| Moment | Purpose | Durable Output |
| --- | --- | --- |
| Material event or signal | Detect and classify a new issue/risk quickly enough to prevent surprise. | Evidence-linked signal/risk record and named next review. |
| Weekly engagement review | Inspect outcome trajectory, stage-gate readiness, actions, dependencies, and ownership. | Concise risk-to-action brief; updated decision/risk log. |
| Stage-gate review | Decide whether evidence supports continuing, reshaping, promoting, handing over, or stopping. | Explicit decision, approver, rationale, residual-risk treatment, and next stage. |
| Portfolio/capacity review | Compare authorized engagements for material concentration, systemic blockers, capability gaps, and leadership decisions. | Prioritized exceptions and decisions — not a league table of customers or individual engineers. |
| Health-model calibration review | Determine whether configured signals identify actionable risk early enough and fairly across relevant segments. | Versioned changes, rationale, validation results, and regression evaluation updates. |

For portfolio views, prioritize by customer consequence, urgency, confidence, reversibility, and required decision—not by volume of alerts. Show signal concentration, source freshness, and evidence gaps so leadership can distinguish a growing pattern from a data-quality problem.

## Model and metric stewardship

Health signals are hypotheses until they prove useful. Keep deterministic metric definitions outside this skill in a versioned Turas metric catalog or domain module.

- Define the decision each signal supports before collecting it.
- Use leading indicators tied to the workflow and customer outcome; pair them with lagging outcome evidence.
- Segment carefully where customer lifecycle, product/workload, geography, contractual model, or service motion changes what a signal means.
- Preserve qualitative customer and delivery context, but label it as judgment and do not let it silently override evidence.
- Review false positives, missed risks, action timeliness, and whether interventions improved the stated outcome. Retire signals that do not improve a decision.
- Do not redistribute missing data into a more confident score. Surface it as an evidence gap.
- Do not measure FDE/PS performance primarily by the count of risks logged, alerts closed, or utilization. Those measures can reward concealment, superficial closure, or unsafe speed.

## Turi behavior while using this skill

1. Load this skill before explaining or assessing engagement health, a delivery/customer-outcome risk, a risk-to-action plan, or a portfolio risk view. Load the other two operating skills only when their respective maturity or delivery context is needed.
2. Retrieve authorized, scope-aware data through typed read tools. Cite source, timestamp/freshness, assessment or metric version, confidence, and material gaps.
3. Separate source facts, derived signals, risks/issues, and recommendations. Make the customer consequence and the next decision clear.
4. Do not invent a probability, health score, root cause, customer sentiment, commitment, scope change, staffing need, or commercial forecast. State uncertainty and seek the smallest validating evidence.
5. Treat all recommendations as drafts. Creating or changing a risk record, lifecycle stage, staffing allocation, plan, customer communication, commercial commitment, or external workflow requires an explicit approval-gated tool/workflow.
6. For a critical issue, make the human escalation route and immediate safety/containment need prominent. Do not send communications, change systems, or claim incident resolution without explicit authorization and source evidence.

## Required Turas records and deterministic rules

Turas should store health and risk as structured, authorized operational data. This skill governs interpretation; it is not a database schema, scoring engine, or source of truth.

At a minimum, maintain:

- assessment boundary, purpose, observation window, assessor, model/metric version, state, confidence, and review date;
- source facts and signals with source reference, event/observed time, ingestion time, freshness, classification, and access limitations;
- risk/issue/dependency/assumption records with condition, cause where evidenced, consequence, state, likelihood/impact rationale where used, owner, collaborators, response, decision date, and closure evidence;
- links to engagement stage, outcome baseline/target, maturity assessment, milestones, stage-gate evidence, customer owners, and approved commercial/policy constraints;
- escalation, mitigation, acceptance/defer, and closure decisions as append-only history with approver, rationale, and residual risk; and
- health-model definitions, segment rules, threshold/configuration history, calibration results, and evaluation cases in versioned application/domain modules.

Turi may explain a stored state and draft a recommendation. It must not silently recalculate an undisclosed score, alter a record, assign an owner, close a risk, or treat a prompt as an audit event.