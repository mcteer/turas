# Prompt inventory and tuning

## Method

[The DSPy paper](https://arxiv.org/abs/2310.03714) treats prompts as parameters of a program with explicit inputs and outputs. [The GEPA paper](https://arxiv.org/html/2507.19457v2#S3) and [DSPy’s GEPA guide](https://dspy.ai/current/diving-deeper/gepa-in-depth/) describe using scored traces and diagnostic feedback to propose mutations, choosing parents from a per-example Pareto frontier, and selecting a candidate on validation performance. That winner can still overfit ([generalization discussion](https://arxiv.org/html/2507.19457v2#A8)); a separate held-out comparison and review are required. A scalar mean cannot overrule evidence or privacy failures.

Turi stays on Eve. DSPy and GEPA are development tools, not runtime dependencies. The experiments target the product-adoption synthesis block at the start of `lib/conversations/ordinary-instructions.md` (`--target adoption`, feature [018](../specs/018-legacy-backend-parity/spec.md), US1/FR-004) and the product-naming section of `agent/skills/customer-posture/SKILL.md` (`--target posture`, feature [003](../specs/003-customer-profile-review/spec.md)). Each adapter freezes the root prompt and the rest of the target file. The skill test isolates the loaded skill text; it does not test skill discovery or its interaction with the complete ordinary prompt. There are no tools, model-controlled subprocesses, database reads, network searches, or runtime writes in a rollout. A synthetic evidence packet stands in for already-authorized retrieval. This tests wording after retrieval, not Eve message assembly, actual lookup, permissions, research, or citation-ID transport.

## Inventory and disposition

| Surface | How it reaches a model | Tuning disposition |
| --- | --- | --- |
| Project and coding harness | `AGENTS.md`, `.specify/memory/constitution.md`, `.specify/workflows/`, and `.agents/skills/` (Spec Kit, Neon) govern maintenance and releases, not Turi. | Leave unchanged. Evaluate tool-driven coding work separately against its own policy and representative repository tasks. |
| Turi root and ordinary chat | `agent/instructions.md` plus `agent/instructions/normal-chat.ts` imports ordinary Markdown only for a normal attempt. Other modules under `agent/instructions/` add mode-scoped instructions and bound context. `lib/server/conversations/model-budget.ts` appends the current evidence packet and exact unverified attachments. `agent/memory/file.ts` advertises private preference recall, not customer facts. | Start with product-adoption synthesis. Do not optimize identity, authority, attachment framing, or freshness routing as free text. A root expansion previously exceeded learning’s 24 KiB cumulative limit ([022 validation](../specs/022-fresh-guidance-learning/validation.md)). |
| Runtime skills and tool metadata | `agent/skills/` includes customer learning, maturity, posture, delivery methodology, health/risk, governed learning, expansion, business review, solution research, and TAM support. Three dynamic skill loaders resolve delivery planning, execution, and staffing content under `lib/`. The governed `agent/tools/load_skill.ts` also resolves feature-scoped procedures. Tool descriptions and schemas are additional routing signals. | Compare skill loading and final answers separately. Anchor maturity to demonstrated capability, finance to domain calculations, and proposals to explicit human decisions. Use versioned fixtures, not full skill-directory rewrites. |
| Governed feature prompts | `agent/instructions/{plan,staffing,execution,support,expansion,learning}-context.ts` combines typed contracts and bound snapshots with prompts in `lib/` or `lib/server/`. Learning has its own fixed paired rubric and release gate. | Require exact contract and result validation plus bound, stale, missing-source, and denial cases. Keep output/authority checks in the server. Do not reuse the learning release evaluation as optimizer data. |
| Research workers and direct model calls | The three `agent/subagents/*/instructions.md` prompts get server-bound specialist handoffs. `agent/lib/legacy-research/` supplies the reservation message and progress contracts. `decision-workflow.ts` and `independent-search.ts` under `lib/server/research/specialists/solution-research/` have separate provider prompts. | Evaluate worker traces against bounded source/citation coverage, reuse, cancellation and retention; check typed decisions against independent judgments. Leave the one-query search contract and deterministic composition alone. |
| Other dynamic instructions | `artifact-context.ts`, `customer-context.ts`, `research-context.ts`, `research-read-context.ts`, `retrieval-context.ts`, and `ordinary-operations.ts` convey provenance, scope and tool contracts. Some intentionally use user-role content. | Do not turn untrusted data into system instructions. Evaluate actual ordered messages, selected tool calls, output limits and user-visible failure states before changing these. |

### Confirmed mismatches corrected in the working tree

- Ordinary chat now follows `agent/instructions.md` and `agent/tools/search_evidence.ts`: `current_fact` for present-day guidance, `accepted_fact` for explicit factual history, and `discovery` for investigation or confirmed conflicts. This does not close feature 022 T012, which still requires actual automatic-research quality evidence.
- `lib/support/skill-text.ts`, the text returned by the governed loader, now matches the Eve skill on at most two suggested actions and original-passage citations. The existing five-item validator compatibility bound is unchanged.
- `agent/skills/customer-posture/SKILL.md` now passes the journey tool’s `nextOffset` back as `offset` for the next page. The synthesis replays do not exercise a real multi-page journey.
- The delivery methodology skill now ends with Close and treats codification as cross-cutting, matching the [product blueprint](product-blueprint.md). The maturity skill now requires six dimensions for a formal assessment, marks unsupported dimensions Unknown, and reports an overall stage only when the reviewed assessment supports it. The solution-research skill now attributes an assessment to the evaluator model returned by the tool, not the chat model.

## Running the experiment

```sh
uvx --python 3.12 --from 'dspy==3.2.1' --with 'gepa==0.0.27' python evals/prompt_tuning/run.py
```

The default is offline and checks corpus splits, markers, and scorer negative controls. With `AI_GATEWAY_API_KEY` supplied through a protected environment, append `--live --run-id <unique-id>` to opt into [Vercel AI Gateway](https://vercel.com/docs/ai-gateway/sdks-and-apis/openai-chat-completions). Run only against the checked-in synthetic corpus. No OrbStack service is needed. The isolated Python versions are explicit; no Node dependency or runtime model selection changes. The task model is the existing `anthropic/claude-sonnet-5.5` (low reasoning); GPT-4.1 proposes revisions and does not grade them.

Each GEPA target uses six training cases for reflection, five validation cases for candidate selection, and eight disjoint held-out cases with two paired repetitions per case. `--target adoption-review` skips search and compares the policy-preserving [review draft](../evals/prompt_tuning/adoption_draft.md) with the baseline on six new paired cases. Checks score workload/date markers, original URLs and brevity; known forbidden claims, injected markers and unexpected URLs zero the case. This lexical score is not semantic proof: reviewers must check whether each citation supports its specific claim, what is still unknown, and whether any case regressed unnoticed. Never select or iterate on the held-out cases. If the metric or instructions change in response to those results, use a fresh holdout for the next decision.

Limits: a GEPA `max_metric_calls` setting of 36 (its last batch can overshoot), a hard cap of 80 attempted Gateway calls per run including reflection and holdout, 48 KB per request, 3,000 completion tokens for the task model or 1,600 for reflection, and a ten-minute admission window. Each request has at most a 25-second socket timeout, with no application retries or redirects. Record actual usage and review local budget before running. Reports are created exclusively under ignored `local-artifacts/prompt-tuning/`; the runner never applies a candidate. Do not promote a candidate based on these checks alone: require no significant held-out regression, semantic review, and a representative native Eve evaluation under the same authorization and cost limits.

## Results — 2026-11-26

| Live Gateway target | Held-out lexical score | Automated gates | Mean answer words | Calls | Decision |
| --- | --- | --- | --- | --- | --- |
| Adoption GEPA (`adoption-v2.json`) | 0.568 → 0.921 | 10/16 → 15/16 | 211.1 → 67.6 | 70 | Reject raw candidate: it introduced an exception to ignoring embedded evidence instructions and assumed a synthetic packet format. |
| Posture GEPA (`posture.json`) | 0.674 → 0.975 | 13/16 → 16/16 | 274.6 → 55.6 | 71 | Reject raw candidate: it required steward review for all claims and omitted dates on both trial cases. [Policy-preserving draft](../evals/prompt_tuning/posture_draft.md) is not evaluated. |
| Adoption review draft (`adoption-review.json`) | 0.645 → 0.740 | 9/12 → 10/12 | 206.3 → 212.6 | 24 | Do not promote: no brevity improvement; both scope cases still mentioned a deliberately irrelevant vendor example. |

Rows compare baseline to candidate; the review draft uses a separate corpus and is not directly comparable to the original GEPA row. Manual inspection found false positives from the lexical gates, including correct denials containing “hosted on Vercel” and compatible sources described as “do not conflict.” The original adoption baseline also repeated an injected marker once. The posture baseline repeated the injected marker in both replicates. Treat these scores as search signals, not accuracy rates or security assurances. The simulated evidence enters as user-role text, so results also reflect the model's response to a pasted excerpt rather than a native, authorized tool receipt. The next useful validation is a frozen actual-Eve answer step fed synthetic native receipts, with per-claim review of scope, provenance and citation support and a separate routing test.

Two setup attempts stopped at the local byte cap (zero calls) and a provider completion-token limit (two calls). The bounded reruns completed. Across all attempts there were 167 Gateway calls and approximately $3.46 at catalog list rates from reported tokens, not reconciled billing. No runtime prompts were changed. No native live, Preview, or Production model behavior was verified by this exercise.


## Constrained follow-up

`--receipt` separates the user request from a frozen synthetic tool call and result. It is Gateway replay, not execution of `get_customer_evidence` or of Eve. GEPA's reflection model selects only among four authored answer-format variants. The original evidence, approval, scope, and tool instructions are outside the mutation. `routing.py --live` compares the first proposed `search_evidence` call on the checked-in baseline and revised instructions using the actual tool description; the harness does not execute the call. Both require protected Gateway credentials and emit ignored reports.

| Follow-up | Held-out score | Automated gates | Mean answer words | Decision |
| --- | --- | --- | --- | --- |
| Constrained adoption (`adoption-receipt-v3`) | 0.740 → 0.752 | 8/10 → 8/10 | 151.1 → 112.9 | Promising format; both arms mentioned an irrelevant vendor example in both repetitions. |
| Constrained posture (`posture-receipt`) | 0.794 → 0.818 | 9/10 → 10/10 | 216.7 → 206.1 | GEPA selected unchanged text. The observed difference is run-to-run variation, not improvement. |
| Policy-preserving posture draft (`posture-review`) | 0.871 → 0.870 | 10/10 → 10/10 | 246.4 → 247.7 | No material measured improvement; retain current product-naming section. |
| Evidence routing (`freshness-routing`) | — | 8/8 → 8/8 | — | Both proposed the correct first tool and arguments. Keep the wording correction because it removes a real contradiction, not because the replay established a lift. |
| Revised adoption format, fresh cases (`adoption-format-review`) | 0.550 → 0.560 | 6/10 → 6/10 | 143.5 → 117.7 | The brevity gain replicated, but both arms still volunteered out-of-scope names in both distractor cases. Keep the [format draft](../evals/prompt_tuning/adoption-format_draft.md) out of runtime pending a native comparison. |

The original adoption receipt attempts stopped after 12 and 25 requests. The second revealed an empty `stop` response, not a token-cap issue. In the finished replay, an empty `stop` counts as a failed answer rather than a transport failure; both arms also get the same explicit final-answer boundary. The posture GEPA run predated that boundary. The final GEPA batches consumed 44 adoption and 40 posture metric calls despite `max_metric_calls=36`; the request caps held. The follow-up used 226 Gateway calls, including the stopped attempts, at an estimated $4.75 in catalog list rates from reported tokens (not reconciled billing).

`node scripts/check-legacy-parity-disposable.mjs --support-native --native` (Node 24) exited 1 before any support behavioral assertion. Next.js 16.4.3 stopped during disposable startup after reporting a security advisory. Eve reached its listening state; the fixture Postgres container retired and no parity-owned container remained. The ordinary native case did not run. No dependencies, development data, Preview, or Production were changed; this is neither a passed native quality gate nor a dependency upgrade.


## Follow-up: narrow adoption evidence before synthesis

Ordinary chat now resolves the named account and calls `get_customer_adoption`
for adoption summaries. The governed profile reader supplies typed reviewed
product records and curated dated public workload references only. It does not
promote legacy mention-index entries into proof of use or pass source passages,
free-form summaries, or titles into this view. Coverage is explicitly partial;
use focused evidence search for a missing material claim or an exact quote.
The initial customer hint carries identity only. After a successful adoption
receipt in the active turn, the model's automatic refresh uses the scoped view
instead of putting raw account passages back into the prompt. Normal authorization,
withdrawal and conflict checks still run; the raw evidence tools are unchanged.

The disposable database regression retains a source that mentions its customer's
Next.js storefront and a different company's Vercel Blob example. The authored
tool and automatic refresh both keep the exact storefront, publication date, and
citation without the Blob example; the ordinary raw path still contains the
original text. A scripted model captures the actual outgoing prompt from the
ordinary model wrapper. The database checks also withhold canonically conflicted
research and reviewed product records while keeping unaffected evidence, deny
an unassigned partner, and omit a withdrawn revision.
A six-call Gateway replay then compared the same synthetic source in raw versus
scoped tool messages. All three raw answers mentioned Blob; none of the three
scoped answers did. All six included Next.js, Storefront, the source year, and its
URL. This verifies the fixture, not a guarantee about free-form prose, prior-turn
history, or explicit raw retrieval. Native Eve tool selection and hosted behavior
were not exercised. The replay and receipt are in ignored
`local-artifacts/prompt-tuning/scoped-adoption-replay.*`.
