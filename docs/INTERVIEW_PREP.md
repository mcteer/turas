# Director, FDE / Professional Services: interview preparation

These are the ten most likely question themes inferred from the supplied panel brief, not a prediction of the panel's exact wording. Numbers are synthetic assumptions. Speak in terms of the business you propose to build; do not imply access to Vercel's internal economics or claim customer results that have not been measured.

## Opening: 45 seconds

“I would build a weekly operating review first. An early services team can have customer demand and still lose money through ambiguous scope, slow customer decisions, and scarce skills. Turas connects those signals to a decision: intervene, reprice, defer, or hand off. The demonstration moves from an engagement exception to the economics and capacity constraint behind it. Turi helps synthesize evidence and request a decision; deterministic code does the arithmetic, and the delivery leader retains accountability.”

## 1. Why this artifact first, and why does it deserve time in your first 90 days?

**Talk track:** “The first operating risk is accepting commitments faster than the team can deliver them predictably. I want a common review across GTM, delivery, and finance: who owns the next decision, what evidence supports it, and what happens to customer value and contribution if we do nothing? I would pilot it on a small number of engagements before investing in broad integrations.”

**Show:** `/portfolio` → pilot exception → customer outcome, evidence, owner, forecast. The narrow action is a proposed intervention; this is not a replacement CRM or accounting ledger.

**Likely challenge — Why not a spreadsheet?** A spreadsheet is a valid starting point for the math. This app adds a shared evidence-to-decision workflow, scoped conversation history, typed calculations, and an approval request. If it does not improve forecast accuracy or decision latency over the spreadsheet baseline, do not expand it. Time saved is a hypothesis until measured.

## 2. Walk us through your P&L. Is that really margin?

**Talk track:** “I distinguish allocated engagement contribution from the function's operating contribution. Engagement contribution subtracts assigned delivery hours and nonlabor costs from the fee. The function must also cover the full salary base, bench, presales, enablement, and overhead. I count full annual payroll once; I do not subtract it again from an already fully costed total.”

**Show:** `/operating-model` → Annual services plan → Show calculation and sensitivity.

| Proposed annual assumption | Default |
| --- | ---: |
| Delivery headcount / available weeks / hours each week | 3 / 46 / 40 |
| Annual available hours | 5,520 |
| Billable utilization / billable hours | 65% / 3,588 |
| Realized hourly rate, after discounts/write-offs | $250 |
| Modeled annual revenue | $897,000 |
| Full annual loaded payroll | $690,000 |
| Function overhead / delivery nonlabor cost | $90,000 / $30,000 |
| Modeled operating contribution / margin | $87,000 / 9.70% |
| Break-even billable utilization | 58.70% |
| Realized rate for a 20% operating margin at 65% utilization | $282.19 |

The $230k annual loaded cost includes salary, benefits, and employer costs; 46 available weeks reduce capacity for leave/holidays without reducing salary. Define the overhead allocation with Finance before treating it as a complete P&L. The annual model is an independent scenario, not annualized revenue from the four engagement records. It omits tax, financing, and corporate allocations beyond the entered overhead. Contract fees are not automatically recognized revenue or cash; track bookings, recognition, invoices, and collection separately in the real business.

**Likely challenge — What happens if demand softens?** At 50% utilization and unchanged rates/costs: revenue $690k, operating loss $120k. At 75%: revenue $1.035m, contribution $225k (21.74%). The 25% protected-time assumption makes 75% a ceiling, not a blanket employee target. Do not solve a pricing problem with unsustainable utilization.

## 3. What would you sell, how would you scope it, and how would you price it?

**Talk track:** “Start with two repeatable offers: paid discovery with an explicit go/no-go output, then a bounded prove-and-launch engagement with enablement and acceptance. Sell an outcome with customer dependencies, not an open-ended engineering team. Fixed fee works where scope and acceptance are bounded; unresolved integration risk is better handled with capped time and materials or a paid discovery step.”

**Show:** the operating plan's offer/decision-rights sections and an engagement's baseline and what-if inputs.

**Defend the quote:** 120 estimated hours × $125 loaded cost + $2k nonlabor = $17k cost. Add 20% cost contingency → $20.4k. Divide by (1 − 35% target engagement contribution) → $31,384.62, rounded up to $31,385. Margin is not markup. This cost floor does not prove willingness to pay or guarantee whole-function profitability. Validate value, alternatives, realized rate, scope confidence, and the annual plan.

**Likely challenge — A seller needs a discount to win a strategic deal.** Document the price/margin exception with an executive sponsor, capped investment, evidence of platform fit, and expiry. Change scope before silently eroding quality. Milestone payments, acceptance terms, and a change-control owner belong in the SOW. The app presents this proposed policy; it does not generate contracts or enforce a deal desk.

## 4. How do you align with GTM without becoming free implementation or competing with partners?

**Talk track:** “Qualify the customer workflow, sponsor, measurable outcome, platform fit, and delivery capacity before selling high-touch work. Sales owns the opportunity; delivery signs off scope and staffing feasibility; I own the commercial exception. FDE stays close to novel, platform-critical problems and reusable learning. Partners take repeatable implementation where they can own quality and economics.”

**Show:** Services operating plan → Decision rights. Use Coda discovery as a case that is not ready for an implementation commitment because its baseline and priority workflow are missing.

**Likely challenge — Do you optimize services revenue or platform growth?** Own services economics explicitly while tracking platform adoption as a separate strategic outcome. A justified subsidy is visible investment, not hidden margin. Do not count an account's entire expansion as incremental revenue caused by services. Compare cohorts and record other contributors before making an attribution claim. CRM opportunity qualification, attribution analysis, and partner routing are proposed next steps, not implemented integrations.

## 5. How will you hire, manage utilization, and scale a small team?

**Talk track:** “I plan capacity by skill and date, not by aggregate spare hours. I protect presales and time for reusable work. I hire when sustained, qualified demand exceeds the existing skill capacity; a temporary peak may justify a partner instead. The first team needs both technical discovery judgment and disciplined delivery ownership, with explicit handoffs between them.”

**Show:** Ask Turi “What capacity is available for the pilot intervention?” It should use `get_capacity`. Avery has 40 weekly hours − 28 committed − 8 protected = **4 schedulable hours**. Quinn's eight free Discovery hours do not replace Enablement expertise. The annual planning model is a separate horizon; do not substitute its average capacity for the weekly roster.

**Likely challenge — Can you approve 40 hours when there are only four available?** Not as a one-week staffing promise. Defer the gate, create an agreed multiweek plan, or secure a qualified alternative. Approval of the proposal does not schedule an engineer. The fixture's proposed start date has no fully staffed schedule behind it.

**Leadership follow-up:** evaluate customer independence, delivery quality, estimate accuracy, mentoring, and reusable contributions alongside utilization. Review overload and skill concentration in weekly staffing; coach through design reviews and retrospectives. Before a hire, test start-date certainty, skill mix, onboarding time, ramp cost, and downside demand—not just pipeline dollars.

## 6. Show a decision this changes. What if your proposed intervention is wrong?

**Talk track:** “The pilot has a $60k fee, 240 actual hours, 80 forecast remaining hours, $125 loaded hourly cost, and $3k nonlabor cost. Baseline cost is $43k and allocated contribution is $17k, or 28.33%. The proposed bounded intervention replaces the remaining 80 hours with 40, lowering allocated cost to $38k and raising contribution to $22k, or 36.67%.”

**Show:** `/engagements/eng-notion-pilot` → change remaining hours 80 → 40 → 120.

**The trap:** the 40 hours must replace the 80, not be added to them. If additive, 120 remaining hours produce $48k cost and **$12k contribution (20%)**. State this assumption before showing the upside. Forty fewer hours release capacity; they do not automatically reduce salaried cash expense or create $5k incremental profit. Replacement scope must preserve customer acceptance and obtain qualified capacity.

**Likely challenge — What does approval actually do?** The owner-only tool requests human approval and records a synthetic decision. It does not update the fixture forecast, allocate real staff, authorize a contract, or message a customer. Hosted approval/replay and database persistence need a recorded rehearsal before claiming the live loop works end to end.

## 7. How will you measure customer success and show ROI?

**Talk track:** “Measure whether the customer can run the workflow independently and achieve the agreed result. The pilot's 12-of-40 training completion is a leading indicator, not realized adoption. I need a named operating owner, acceptance evidence, and a 30-day review of independent use. For our function, I pair that with forecast error, unapproved scope, rework, margin, and time to resolve decisions.”

**Show:** pilot evidence and Coda's explicitly missing adoption baseline. Ask Turi what is observed versus proposed. The data is a fixed-date synthetic fixture, not a live feed or a measured before/after result.

**Likely challenge — What is this tool's ROI?** Baseline review preparation time and decision latency before the pilot. Model cost of review labor, hosting/inference/storage, ongoing maintenance, and verified avoided rework. Release of salaried time is capacity value unless redeployed or cost is actually removed. Do not double-count recovered margin and the same recovered hours as two benefits. Web Analytics provides page usage, not causal customer value or services ROI.

## 8. Why these Vercel capabilities, and what is actually agentic?

**Talk track:** “The UI gives operators deterministic evidence and calculations even when inference is unavailable. Turi selects typed reads, asks for missing context, compares scenarios, and requests human approval for a bounded write. AI handles synthesis and workflow navigation; the application owns the arithmetic and decision rights.”

| Capability beyond deployment | Role and deliberate choice | Tradeoff / proof boundary |
| --- | --- | --- |
| AI SDK, through Eve | Typed model/tool interaction and streaming | Framework accelerates a coherent runtime; adds dependency and preview-version risk. |
| AI Gateway | Inference routing and usage visibility | Central route instead of app-specific provider clients. Custom fallback/budget policies are not demonstrated merely by using Gateway. |
| Vercel Workflow, through Eve | Durable agent execution and resumable waits | Useful for human response delays. Durability does not make a SQL side effect exactly-once. Rehearse reconnect/replay on the deployed service. |
| Vercel Web Analytics | Page-use signals for the operator experience | Usage helps prioritize UX; it is not a business-outcome metric. |
| Preview Deployments | Isolated build/review iteration | A ready build is not proof of signed-in flow or environment isolation. |

Next.js renders the application; Postgres stores application sessions, conversation metadata, and decision records. The operational portfolio is authored fixture data. Neon is the relational provider, not another Vercel-native database product to count. Research is a bounded reviewed-source specialist, not live autonomous web research. Preserve the selected model; establish quality/cost/latency evidence before changing it.

Official references: [AI SDK](https://ai-sdk.dev/docs/introduction), [AI Gateway](https://vercel.com/docs/ai-gateway), [Workflow](https://vercel.com/docs/workflows), [Analytics privacy](https://vercel.com/docs/analytics/privacy-policy). Local Eve contracts are in `node_modules/eve/docs/`; they document the installed runtime version.

## 9. How do you prevent hallucination, data leakage, and unsafe actions? What breaks?

**Talk track:** “Separate observed evidence, proposed policy, and calculated results. Tools validate inputs; calculation code owns the numbers; customer names resolve to canonical fixture accounts; the write has a human approval gate and an owner check. Missing evidence must stay missing. A failed model call should leave the deterministic review usable and should never be reported as a successful action.”

**Show:** unknown customer request → no guessed account or connector setup; annual calculator → invalid-input and capacity warnings; intervention → explicit approval request. Existing and new evals cover customer/provider collisions and commercial reasoning. Report actual runs and failures, not the presence of test files as proof.

**Be candid under scrutiny:** this is not yet an audited multi-tenant production service. The chat creation/bind APIs still accept a browser-provided Eve session reference; server-owned first-send binding is a release blocker for real customer data. Decision deduplication currently has a check-then-insert race and unscoped key lookup; atomic scoped writes and payload-conflict detection are needed. Runtime schema creation needs controlled transactional migrations. Demo identities are not enterprise SSO, and login throttling/CSRF coverage needs hardening. These are specific findings, not solved merely by signed cookies or an approval dialog.

The last recorded hosted rehearsal was limited to a ready Preview build and `/login`; the release checklist records the missing configuration. Do not promise persistence, cross-user isolation, approval replay, recovery, or load behavior without new evidence. Restrict the interview deployment to fictional data.

## 10. What would you validate in 30 days, and build next by day 90?

**Talk track:** “In month one I would pressure-test demand quality, realized rate, fully loaded cost, skill availability, acceptance criteria, and the effort-forecast error with GTM, delivery, finance, customers, and partners. Month two pilots two bounded offers with explicit deal and delivery decision rights. Month three expands only if accepted outcomes, forecast accuracy, and decision speed improve without increasing rework.”

**Show:** Services operating plan → First 90 days, then `/memo` for the concise thesis.

**Priorities:** first close the security/durability gates above; then integrate a governed operational source and measure adoption of the weekly review. Add commercial scoping and partner capacity only once the process is stable. Hire against verified skill/date demand. Capture repeatable patterns into enablement and platform feedback rather than building a custom tool per account.

**Likely challenge — What would you stop doing?** Decline open-ended staff augmentation, implementation without a customer owner, unsupported platform fit, and commitments with no feasible staffing path. Sunset dashboards that do not change decisions. Explicitly decide whether a strategic engagement is paid PS or a budgeted adoption investment.

## A 23-minute presentation route

| Minutes | Demonstration | Point |
| --- | --- | --- |
| 0–2 | Opening and `/portfolio` | The weekly decision and why it matters |
| 2–7 | Pilot evidence, 80 → 40 → 120 hours | Outcome, scope, contribution, and assumptions |
| 7–11 | `/operating-model`, 65% → 50% → reset | Full-function P&L, pricing, protected capacity |
| 11–15 | Turi engagement/capacity brief and unknown account | Grounding and skill constraint; arithmetic remains deterministic |
| 15–18 | Approval request, only if hosted rehearsal has passed | Decision rights; accurately describe what the write changes |
| 18–21 | `/memo` and architecture | Three deliberate Vercel capabilities, tradeoffs and boundaries |
| 21–23 | 30/60/90 plan | How the pilot becomes an operating function |

If inference is unavailable, use the deterministic pages and explain the unverified agent step. Do not substitute a fabricated live response. Keep roughly 22 minutes for discussion.

## Questions to ask the panel

- Where is the function currently constrained most: demand qualification, technical delivery, capacity, or commercial ownership?
- How do you want to balance direct services contribution with explicitly funded platform-adoption work?
- Which delivery responsibilities should remain internal versus partner-led as demand scales?
- What evidence would make you confident this function is succeeding six months from now?
