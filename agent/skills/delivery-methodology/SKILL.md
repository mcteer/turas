---
name: delivery-methodology
description: Use when qualifying, planning, delivering, assessing, handing over, or scaling a Forward Deployed Engineering or Professional Services engagement; when advising on delivery risk, capacity, playbooks, or field-to-product learning; or when creating an FDE/PS operating cadence.
---

# Vercel FDE/PS Delivery Process and Methodology

## Purpose

Use this skill to help Vercel's Forward Deployed Engineering (FDE) and Professional Services (PS) teams deliver measurable customer outcomes, while building capability that outlasts an individual engagement. Turi loads and applies this method when responding to relevant requests in the Turas application. This is an operating method, not a rigid project template.

The method has four non-negotiable outcomes:

1. The customer realizes a measurable improvement in an important workflow.
2. The resulting system is safe, supportable, and owned by the customer or a clearly agreed operating team.
3. The delivery team learns enough to make the next comparable engagement better, faster, or safer.
4. The team protects technical quality, customer trust, and the sustainable capacity of its people.

Treat a signed statement of work, a deployed prototype, usage, billed time, or closed project plan as evidence along the way — not as proof of success by itself.

## Method Principles

- **Outcome over output.** Begin with a specific customer workflow, accountable sponsor, baseline, desired change, and decision or behavior that must improve. Do not accept “build an app,” “adopt AI,” or “migrate to Vercel” as the outcome.
- **Embed to learn and transfer.** Work alongside customer engineers, operators, security teams, and business owners. The aim is not perpetual dependency; it is a working solution and a customer team that can operate and evolve it.
- **Run two tracks from day one.** The *value track* establishes whether the prioritized workflow creates value. The *production track* establishes whether it can be trusted, supported, secured, and owned. Do not defer the production track until a pilot impresses someone.
- **Use the smallest credible proof.** Narrow the initial scope to the riskiest assumptions and the smallest useful user group. A prototype may prove desirability or feasibility; it is not automatically ready for production or broad rollout.
- **Make decision rights explicit.** FDEs can lead technical discovery and delivery. They do not silently own customer commitments, commercial terms, policy exceptions, production acceptance, or product-roadmap decisions.
- **Compounding field learning.** Every material engagement produces a deliberate decision: retain an account-specific exception, publish a playbook, create an accelerator/connector, improve documentation, request a platform/product investment, or consciously do nothing. A Slack thread is not a product feedback loop.
- **Respect the customer estate.** Vercel is valuable where it improves the customer-facing experience, delivery loop, security, observability, or AI operations. Preserve customer choice for systems of record, specialized backends, data platforms, identity, and regulated infrastructure.
- **Protect the delivery team.** Staffing quality considers technical depth, relevant lived experience, domain context, communication, travel/load, and mentorship — not availability or utilization alone.

## Inputs and Operating Assumptions

Before giving a delivery recommendation, retrieve the authorized account, engagement, maturity, and evidence records. For maturity assessment or a maturity-informed plan, load the `customer-maturity-journey` skill first and apply its versioned criteria. A maturity stage informs the delivery approach; it does not override the customer’s actual objective, constraints, or decision rights.

Treat these as required information, not assumptions to invent:

- customer workflow, business owner, technical owner, and executive sponsor;
- desired customer/business outcome, baseline, target, and measurement method;
- maturity context, existing architecture, data/integration boundaries, and operating constraints;
- commercial scope, timeline, dependencies, and escalation path;
- security, privacy, regulatory, residency, procurement, and support requirements;
- current evidence freshness, unknowns, risks, and decision log.

If a material item is missing, say what cannot yet be concluded and propose the smallest discovery action needed to resolve it.

## The Delivery Lifecycle

The lifecycle is staged for clarity, but iteration is normal. A team may return to discovery when evidence invalidates a key assumption. Record the decision, reason, and consequence rather than silently drifting scope.

| Stage | Objective | Minimum evidence / output | Exit decision |
| --- | --- | --- | --- |
| 0. Qualify | Select work where FDE/PS can create meaningful, measurable, and reusable value. | Problem statement; sponsor and working-team commitment; preliminary maturity/architecture context; expected outcome; commercial and capacity fit. | Accept, reshape, defer, or decline. |
| 1. Discover | Understand the current workflow, people, constraints, and value hypothesis with the customer. | Workflow map; baseline; user/stakeholder map; risks; data/integration and security discovery; candidate success measure. | Agree the problem worth solving and the bounded first outcome. |
| 2. Shape | Turn discovery into an executable delivery plan and production path. | Decision log; scope; acceptance criteria; delivery plan; technical approach; ownership/RACI; value and production-track plan; risk/rollback approach. | Sponsor and technical owners approve the plan or the team re-scopes. |
| 3. Prove | Test the highest-risk assumptions and demonstrate a useful workflow outcome. | Pilot/prototype evidence; user feedback; evaluation or quality results where relevant; updated risk and production-readiness gaps. | Stop, iterate, or promote based on pre-agreed evidence. |
| 4. Promote | Build or harden the production-shaped solution and its operating controls. | Security/access review; integration tests; performance/reliability evidence; observability; support/runbook; training; release and rollback plan. | Customer operating owner accepts release readiness. |
| 5. Adopt and Hand Over | Establish sustained use and customer operational ownership. | Adoption evidence; trained owners; access/support transfer; runbooks; customer acceptance; documented open risks and next review date. | Customer can operate and extend the solution; FDE intensity reduces or ends. |
| 6. Realize and Expand | Confirm outcome realization and choose the next highest-value customer move. | Post-launch baseline comparison; customer feedback; value realization narrative; next-opportunity or closeout decision. | Expand deliberately, optimize, sustain through normal ownership, or close. |
| 7. Codify | Convert field evidence into organizational leverage. This runs throughout the engagement and closes with an explicit decision. | Pattern submission; evidence of repeatability; owner; disposition; resulting playbook, accelerator, roadmap input, documentation, or exception record. | A named owner accepts the follow-through, or the team documents why no generalization is appropriate. |

### Stage 0 — Qualify the Engagement

Recommend acceptance only when the team can identify a consequential workflow, a customer owner who can make decisions, a plausible path to measurement, and a reason the work merits high-touch FDE/PS capacity. A high-value problem may be technically modest; a flashy technology request with no owner or baseline is not a strong FDE candidate.

Check:

- Is there a customer sponsor with authority and a working team with time to participate?
- Can the customer describe the current cost, delay, risk, quality issue, or missed opportunity?
- Does the engagement have a bounded first outcome, rather than an open-ended platform request?
- Are security, data, legal, procurement, or architecture constraints discoverable early enough to plan responsibly?
- Is the work novel enough to justify FDE investment, repeatable enough to teach the organization something, or strategically important enough to warrant an explicit exception?
- Does the proposed staffing match the problem’s technical, domain, relationship, and regional needs?

Turi may summarize qualification evidence and recommend accept/reshape/defer/decline. Starting an engagement, changing commercial scope, or assigning people requires the designated human approval and system workflow.

### Stage 1 — Discover the Real Workflow

Discovery is a joint activity, not requirements collection. Follow the work from trigger to decision/action, including where it breaks, who compensates for it, which systems hold truth, and what a user must trust before changing behavior.

Produce a concise discovery brief containing:

- the customer’s objective and the specific workflow to improve;
- primary users, approvers, operators, and affected non-technical stakeholders;
- current-state journey, failure modes, baseline, and source quality;
- customer architecture, data classifications, integrations, identity, regional/residency, security, and support constraints;
- desired outcome, leading indicators, lagging indicators, and how to measure each;
- options considered, key assumptions, and the decision needed to proceed.

For AI-related work, explicitly discover task boundaries, acceptable error modes, human review/override, evaluation data, and operational escalation. Do not treat a model demo as proof of a reliable business process.

### Stage 2 — Shape the Engagement

Write a short, decision-oriented delivery charter. It should contain the following:

1. **Outcome and Baseline:** The measurable customer change, owner, observation window, and source of truth.
2. **First Scope:** In-scope workflow, users, systems, environment, explicit exclusions, and non-goals.
3. **Acceptance Criteria:** Functional, quality, security, reliability, adoption, and handoff evidence required for the next stage.
4. **Two-Track Plan:** Value-proof milestones and production/ownership milestones, with dependencies visible.
5. **Architecture and Product Choices:** The simplest viable approach; existing customer systems remain in their strongest roles.
6. **Team and Decision Rights:** Named delivery lead, technical owner, customer operator, sponsor, commercial owner, security/privacy approver, escalation route, and review cadence.
7. **Risk and Change Control:** Top risks, assumptions, decision log, change-request path, release/rollback posture, and conditions that would stop or re-scope work.
8. **Learning Hypothesis:** What the team expects to learn that could benefit later customers or the product; this is not a promise of roadmap delivery.

Favor a production-shaped vertical slice over a broad proof of concept. A plan should name the smallest useful release and the next decision, not predict every implementation detail prematurely.

### Stage 3 — Prove Value

The proof is designed to answer the highest-value uncertainties quickly. Keep it appropriately bounded, use authorized data, and expose uncertainty rather than hiding it behind an impressive demo.

Track evidence across four dimensions:

- **Workflow Value:** Does it reduce time, error, risk, cost, or friction; or improve experience, adoption, throughput, or decision quality?
- **User Fit:** Can intended users understand, trust, and incorporate it into their real work?
- **Technical Fit:** Do integrations, performance, model behavior, security assumptions, and reliability meet the agreed bar for this stage?
- **Operating Fit:** Are ownership, support, governance, training, and change-management requirements known and feasible?

At the review, recommend one of three explicit decisions: stop/retain learning, iterate within defined scope, or promote to the production plan. Do not use pilot enthusiasm, executive interest, or a completed demo as a substitute for agreed evidence.

### Stage 4 — Promote to Production

Promotion is a customer decision supported by evidence. The required controls depend on the customer’s risk and the workload, but the plan should address:

- identity, authorization, least privilege, data classification, retention, residency, and secret management;
- integration resilience, idempotency, error handling, rate limits, and dependency failure modes;
- evaluation/quality checks and human-review boundaries for AI or consequential automation;
- observability, alerts, incident ownership, support routing, and customer-visible status/communication needs;
- performance, cost, scale assumptions, capacity limits, and rollback/recovery;
- release governance, test/preview environment, approvals, documentation, training, and change adoption.

Use Vercel capabilities where they solve the stated delivery constraint:

| Customer need | Vercel-aligned delivery pattern | Do not imply |
| --- | --- | --- |
| Faster, safer cross-functional review of a web experience | Share controlled Preview Deployments with the people who must validate design, content, product, security, or business behavior before release. Use appropriate Deployment Protection. | That a preview replaces customer UAT, security review, or change-management approval. |
| A reliable customer-facing Next.js/web application | Use Vercel’s framework-aware delivery/runtime model, observability, and release controls; keep data and specialized services in the systems that best fit them. | That every backend, database, or long-running workload belongs on Vercel. |
| An AI capability needing model choice, visibility, and guarded actions | Use AI Gateway for provider/model routing, fallback, spend visibility, and monitoring; validate outputs and retain human approval for consequential actions. | That a gateway makes an AI workflow accurate, safe, or compliant by itself. |
| Agent-generated or untrusted code | Use Vercel Sandbox to isolate execution from production systems. | That sandboxing authorizes data access or removes the need for policy and review. |
| Durable, multi-step operational work | Use Vercel Workflow for stateful/retried processes; use Queues when independent consumers or fan-out are needed. | That request handlers or agent sessions are a substitute for durable orchestration. |
| A protected customer-facing surface | Use appropriate identity, Deployment Protection, Firewall/WAF, and application authorization. | That platform security replaces customer-specific access control, threat modeling, or contractual requirements. |

Current product capability, plan availability, limits, pricing, and regional suitability must be verified against current Vercel documentation and the customer agreement before it is proposed as a commitment.

### Stage 5 — Adopt and Hand Over

The handover standard is customer self-sufficiency, not a final presentation. Confirm:

- an accountable customer operating owner and technical owner;
- trained users/operators, documentation, runbooks, and access appropriate to their responsibilities;
- support, incident, escalation, and change paths that remain after FDE intensity declines;
- current data/control/monitoring ownership and unresolved risk acceptance;
- an agreed success-review date and the measure that will be used;
- what the customer can now do independently, and what support, if any, remains deliberately contracted.

If these are incomplete, label the engagement as transition-in-progress rather than complete.

### Stage 6 — Realize and Expand

Revisit the baseline after enough operating time for the result to be meaningful. Separate observed adoption, operational performance, and business outcome; do not infer causality that the evidence cannot establish.

Expansion must be earned. Recommend it when the first workflow has a credible outcome, operating ownership, and a reusable lesson or strategically valuable next problem. If those are missing, prioritize stabilization, adoption, or closeout over a larger roadmap.

### Stage 7 — Codify Field Learning

For every reusable candidate, submit an evidence-backed pattern record:

- problem and customer context, with sensitive details minimized;
- what was built/tested and the result, including evidence and limitations;
- the repeated pattern, expected target segment, and prerequisites;
- proposed disposition: playbook, connector/accelerator, product/platform investment, documentation, enablement, or non-generalizable exception;
- accountable product/platform/enablement owner and decision date.

The field-to-product forum decides whether to generalize; FDEs provide evidence and a recommendation. Preserve an explicit “not now” or “do not generalize” outcome so teams do not recreate rejected work.

## Roles and Decision Rights

The exact account model varies, but ambiguity does not scale. Establish the accountable person for each decision early.

| Role | Accountable contribution | Not automatically accountable for |
| --- | --- | --- |
| FDE / Delivery Lead | Technical discovery, solution design, hands-on delivery, delivery-risk visibility, quality evidence, delivery charter, scope/change control, plan/cadence, dependency management, and reusable field learning. | Commercial commitments, customer policy exceptions, staffing assignment, unilateral production acceptance, or owning the customer’s technical operations after handoff. |
| Field Engineer | Hands-on implementation, integration, testing, production readiness, customer enablement, and delivery feedback within an agreed engagement plan. | Commercial commitments, unapproved scope changes, customer policy exceptions, staffing assignments, day-to-day technical operations, or unilateral production acceptance. |
| Customer Executive Sponsor | Outcome priority, organizational alignment, customer resourcing, and high-level decisions. | Day-to-day technical implementation. |
| Customer Technical and Operating Owners | Architecture/integration decisions, operational readiness, adoption, support, and acceptance. | Vercel’s product roadmap or the provider’s staffing commitments. |
| CSM / Account Partner | Adoption, success plan, relationship continuity, renewal context, and escalation coordination. | Replacing the technical delivery owner. |
| Sales / Commercial Owner | Contract, commercial scope, account strategy, and commercial approvals. | Promising a technical outcome without delivery validation. |
| Product / Platform / Enablement Owner | Evaluation of reusable field patterns and the decision to harden, document, prioritize, or decline them. | Turning every field request into a roadmap commitment. |
| Security, Privacy, and Legal Partners | Applicable control, policy, and contractual decisions. | Informal sign-off based on an agent or FDE summary. |

## Cadences and Control Loops

Use a lightweight cadence that follows the engagement’s risk and maturity. Avoid meeting rituals with no decision purpose.

| Cadence | Participants | Purpose and Durable Output |
| --- | --- | --- |
| Discovery / Launch Working Session | Customer working team, FDE | Clarify workflow, assumptions, blockers, and next experiment; update decision/risk log. Tighten near launch or material risk. |
| Weekly Delivery and Sponsor Review | Customer owners, FDE/FE, relevant account partners | Review outcome evidence, plan, risks, decisions, and readiness; publish a concise brief. |
| Stage-Gate Review | Named approvers | Decide continue, re-scope, stop, promote, hand over, or expand based on pre-agreed evidence. |
| Field-to-Product Review | FDE/FE, product/platform/enablement | Triage recurring field evidence; assign a disposition and owner. Run frequently enough to prevent a backlog of unexamined learning. |
| Portfolio and Capacity Review | FDE/FE leadership, CSM/Sales/Product as appropriate | Review demand, delivery risk, capacity/load, strategic accounts, and repeated patterns; rebalance before a customer commitment becomes a staffing emergency. |
| Quarterly Operating Review | Leadership and regional/pod owners | Inspect outcomes, self-sufficiency, reuse, delivery economics, talent health, productization investments, and the maturity of the delivery model. |

## Scaling the Delivery Model

Scale the **learning system and quality bar**, not the number of bespoke deployments. Do not create a separate structure or region merely because there is short-term demand. Add complexity only when the evidence supports a durable boundary.

### Maturity Path

| Phase | Primary Objective | Operating Model | Evidence Required to Progress |
| --- | --- | --- | --- |
| **1. Learn Deliberately** | Establish the customer problem categories, quality bar, and first outcome patterns. | Small senior team; selective flagship engagements; direct leadership/product access; high-touch evidence capture. | Repeatable engagement artifacts, credible outcomes, customer handoff evidence, and a visible field-learning loop. |
| **2. Standardize the Repeatable** | Reduce avoidable reinvention without pretending all customers are the same. | Core playbooks, delivery templates, evaluation/release patterns, shared architecture guidance, and an enablement owner. | A pattern shows recurring demand, measurable benefit, stable prerequisites, and lower effort/risk when reused. |
| **3. Scale Through Pods and Regions** | Increase coverage while preserving customer context and a common quality bar. | Small domain/use-case/region-aligned pods; central practice standards and capability enablement; clear regional policy and escalation ownership. | Regional demand and customer constraints justify local context; playbooks and metrics are stable enough for comparable reporting. |
| **4. Industrialize High-Confidence Work** | Reserve scarce FDE capacity for novelty and strategic complexity. | Implementation paths, trained partners, reusable accelerators/connectors, self-service guidance, and productized platform capabilities. | The work is predictable, well-instrumented, supportable, and does not require deep embedded invention to succeed. |
| **5. Keep Renewing the Frontier** | Prevent the model from becoming a generic services factory. | Senior/innovation FDE capacity for new strategic problems; deliberate rotation into product/platform; quarterly investment choices. | The organization can distinguish new discovery from repeat implementation and funds both intentionally. |

### Scaling Guardrails

- Use explicit engagement qualification and work-in-progress limits. Do not let sales demand, executive escalation, or utilization pressure force every request into a bespoke FDE/PS engagement.
- Maintain a shared taxonomy for customer maturity, engagement stage, risks, outcomes, roles, and metrics. Local adaptation is valid; incompatible definitions are not.
- Create an enablement/productization function before field teams become a permanent documentation bottleneck. Its job is to turn approved patterns into reusable, supported assets.
- Keep a visible exception register. Some work should remain customer-specific; forcing false generalization creates fragile products and misleads future teams.
- Establish a dual career path for technical leadership and people leadership, with mentoring and rotation opportunities. Do not make field work a career detour from core engineering.
- Treat travel, incident duty, account context switching, and sustained urgent work as capacity inputs. High utilization is not a proxy for healthy or scalable delivery.
- Add partner capacity only after the method, quality criteria, training, and escalation model are sufficiently explicit to protect the customer experience.
- Use outcome and reuse evidence to decide whether to invest in a vertical, regional pod, accelerator, or product capability; do not use anecdote alone.

## Metrics

Metrics must be versioned and defined in the Turas metric catalog. Do not aggregate inconsistent local calculations. Pair leading indicators with outcome metrics, and use qualitative customer evidence where causality is uncertain.

| Lens | Useful Measures | Guardrail |
| --- | --- | --- |
| Customer Value | Time-to-first-value; workflow adoption; agreed workflow quality/throughput/risk indicator; customer outcome against baseline. | A usage count is not outcome realization. |
| Delivery Quality | Stage-gate evidence completeness; scope/change stability; production-readiness defects; rework; incident/rollback signal; on-time decision readiness. | Do not reward speed by suppressing quality or risk. |
| Customer Self-Sufficiency | Operating owner acceptance; training/runbook/access completion; support transition; customer-led change or operation after handoff. | A project close date is not self-sufficiency. |
| Leverage | Playbook/accelerator reuse; reduction in repeated effort; field-pattern disposition time; product/platform feedback adoption. | Reuse only counts when the prerequisite/context match is documented. |
| Team Health and Capacity | Sustainable load, context switching, travel/incident burden, mentoring/development participation, retention, and skill coverage. | Do not use individual utilization as the dominant performance measure. |
| Commercial Health | Forecast accuracy, margin/contribution as applicable, expansion/renewal influence, and strategic-account depth. | Do not turn technical delivery into a sales quota that compromises customer outcomes. |

## Turi Behavior with this Skill

1. Load `customer-maturity-journey` when the request needs maturity context; load this skill for delivery-method requests. Use both when planning a maturity-informed engagement.
2. Retrieve authorized evidence from the operational application layer. Cite its source, freshness, and gaps.
3. State the current lifecycle stage, the next decision, the required evidence, owner, and approval needed. Do not infer a stage solely from elapsed time or a color-coded health score.
4. Present recommendations as drafts. For actions that create/change a plan, task, staffing allocation, customer communication, commitment, or external workflow, show an action preview and obtain explicit approval.
5. Recommend the smallest safe next step and distinguish: customer-specific work, a reusable candidate, and a product/platform request.
6. Treat the delivery method as a governed baseline. Customer contractual obligations, data controls, and named decision owners take precedence; log an approved exception with rationale rather than silently disregarding the method.

## Required Turas Records

Turas should eventually store the delivery lifecycle as structured, authorized operational data rather than only in chat text. At a minimum, model:

- Engagement, lifecycle stage, stage-entry/exit date, named owners, and stage decision;
- outcome hypothesis, baseline, target, measure definition/version, observation window, and evidence;
- statements of work, delivery charter, scope, assumptions, dependencies, risks, decisions, and approvals;
- required evidence/checklist status for each stage, with source/freshness;
- customer maturity assessment/version and the maturity-informed plan link;
- staffing/capacity allocations, competency fit, constraints, and approved changes;
- handoff/self-sufficiency evidence, support/operating ownership, and post-launch review;
- field-pattern record, disposition, product/platform/enablement owner, and follow-through state.

Use an append-only audit/decision history alongside current-state views. Make freshness visible. Never present a derived score or agent recommendation as a source fact.