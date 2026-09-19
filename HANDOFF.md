# Turas implementation handoff

> Current status (19 September 2026): login, conversation history, fictional financial scenarios, annual services planning, public customer evidence and Preview deployment now exist. See [the evidence audit](docs/EVIDENCE_AUDIT.md) and [release validation](docs/RELEASE_CHECKLIST.md) for current behavior, tests and remaining production gates. The baseline below is historical and must not be read as the current implementation state.

## Historical baseline

Status recorded: 19 September 2026. Read [AGENTS.md](AGENTS.md) before implementation and [ROADMAP.md](ROADMAP.md) for scope, dependencies, and acceptance criteria.

## Workspace and transfer

- Working folder: `/Users/mcteer/Projects/turas`.
- Branch: `fix/chat-attachments-customer-routing`.
- HEAD at handoff: `2c7a076`.
- **The fixes, tests, roadmap, and this handoff are uncommitted.** Several files are untracked. Open this same folder in the new IDE to retain them. A fresh clone or branch checkout elsewhere will not include them until the work is committed or transferred. Do not discard the working tree.
- No commit, push, Preview deployment, or production deployment was performed for these changes. The existing app is reported live at `turas.dev`; that is not the newly changed code.
- Local credentials stay in the existing environment. They are not reproduced here and must not be committed as part of a transfer.

## Built and available

| Capability | Implementation evidence | Status and limit |
| --- | --- | --- |
| Next.js/Eve chat foundation | `app/_components/agent-chat.tsx`, `agent-message.tsx`, `app/s/[sessionId]/page.tsx`, `next.config.ts` | Existing streaming, cancel/steer, New chat, and URL-based session resume. No persistent conversation list/sidebar. |
| Current demo authentication | `agent/channels/eve.ts` | Existing environment-configured HTTP Basic auth, Vercel OIDC fallback, and local-dev auth. No dedicated login page, cookie session, logout, app user store, or conversation ownership enforcement. |
| Operating methods and memory wiring | `agent/instructions.md`, `agent/skills/`, `agent/hooks/hindsight.ts`, `agent/memory/file.ts` | Existing instructions/skills and memory integration. They do not supply a customer database, deterministic metrics, or approval authority. |
| File and link attachment UX | `app/_components/composer-attachments.tsx`, `chat-attachment.tsx`, `agent-chat.tsx`, `agent-message.tsx`, `components/ai-elements/prompt-input.tsx`, `lib/chat-attachments.ts` | Built locally: visible removable cards, image previews, counts, file/link actions, confirmed-message cards, file-only rendering, conversion errors, and next-draft preservation. Four browser checks pass; no hosted validation yet. |
| Customer-engagement routing guard | `agent/instructions.md`, `agent/tools/connection_search.ts`, `agent/lib/existing-grant-auth.ts`, five files under `agent/connections/` | Built locally: customer names do not trigger generic connector discovery/onboarding. Existing user grants retain their scope; missing grants fail without starting sign-in. Notion regression and auth unit tests pass. Actual hosted connector grants have not been verified. |
| Repeatable browser and auth checks | `playwright.config.ts`, `tests/ui/chat-attachments.spec.ts`, `tests/existing-grant-auth.test.mjs`, `package.json` | Built locally. Playwright test dependency pinned to 1.62.1. Uses bundled WebKit explicitly on macOS to avoid the system-framework launch crash. |
| Routing regression definitions | `evals/evals.config.ts`, `evals/customer-engagement-routing.eval.ts` | Four cases authored: Notion, Linear, Coda, and supplied synthetic engagement evidence. Only the original Notion case has a passing live result on the final implementation. Full final suite remains pending. |

The routing guard deliberately prevents generic provider discovery until D4 provides an authorized customer-source resolver. It does **not** retrieve Notion customer records or prove that any other engagement source is connected. If verified context is missing, Turi must explain that in engagement terms and ask for a note, without inventing facts or offering connector setup.

## Still to build before the demo

No roadmap deliverable has met all of its acceptance criteria. The detailed contracts are in roadmap section 3.

| Roadmap ID | Remaining work |
| --- | --- |
| D0 | Finalize the proposed operating-review scenario, synthetic scenario manifest, acceptance checklist, and enforced runtime capability restrictions. |
| D1 | Configure and verify Vercel Preview deployments, external reviewer link/access, environment isolation, persistent database, migrations, and synthetic reset procedure. Existing Vercel deployment is not evidence these are done. |
| D2 | Build `/login`, server-verified sessions, owner/reviewer identity, logout, protected routes, and conversation ownership checks. |
| D3 | Build the persistent ChatGPT/Claude-style history sidebar, metadata/API, search, rename, archive, mobile behavior, and authorized resume. |
| D4 | Build synthetic customer/engagement/evidence records and deterministic authorized account resolution. |
| D5 | Implement tested revenue/contribution/margin, utilization, and capacity calculations with explicit assumptions. |
| D6 | Build portfolio/engagement views and connect Turi to the same structured evidence and calculations. |
| D6R | Build the research subagent for technical implementation, rollout, customer success, adoption, handoff, and measurable value realization, with sources and bounded access. |
| D7 | Implement one persistent, human-approved synthetic business action with audit, idempotency, and stale-state handling. |
| D8 | Write the one-page interview memo, architecture explanation, demo script, and reviewer submission materials. This IDE handoff is not the interview memo. |
| D9 | Validate all required flows on Preview, rehearse, record the tested commit/URL, and prepare submission at least 24 hours before the interview. |

Suggested next sequence: finalize D0, establish D1 and the D2 authorization foundation, then D3. D4/D5 supply the business data and calculations needed for D6/D6R/D7. Keep D8 drafts aligned with actual capabilities and finish with D9.

## Deferred beyond the demo

All P1–P3 workstreams remain unbuilt: employee SSO/OIDC and organizational authorization; approved real data integrations; transcript and memory governance; runtime restrictions and operational monitoring; pricing/catalog, financial and capacity operations; broader delivery/customer-success workflows; and reusable implementation/value-realization patterns. See roadmap section 4 for the separate scope and exit criteria.

## Validation at handoff

| Check | Recorded result |
| --- | --- |
| `npm run typecheck` | Passed. |
| `npm run test:unit` | 4 passed. |
| `npm run test:ui` | 4 WebKit tests passed, including with the suite starting/stopping the app itself. Requests are intercepted; these tests do not call models or memory. |
| Original Notion engagement routing evaluation | 1 case passed, 6/6 gates, including no `connection_search` call and no `authorization.required` event. Used the configured bank unchanged. |
| `npm run build -- --webpack` | Passed; build configuration was not changed. |
| `npm run build` (default Turbopack) | Failed locally: CSS worker could not bind a port, `Operation not permitted`, even with elevated tool permissions. Still needs validation in the target environment. |
| Declared Node runtime | `package.json` declares 24.x. The recorded local checks ran under installed Node 26.8.2; repeat release checks under Node 24. |
| Hosted Preview, login/ownership, real connector grants, complete routing suite | Not validated on the final implementation. |

For routine local checks:

```sh
npm run typecheck
npm run test:unit
npm run test:ui
```

The UI suite uses `http://127.0.0.1:3100` and starts/reuses the development server. If WebKit is missing in a new environment, install the matching browser with `npx playwright install webkit`. Use the project's `playwright.config.ts`; do not return to direct Safari automation or the failing default macOS WebKit launcher. The `Desktop Safari` device profile in the configuration still runs Playwright's bundled WebKit.

Live routing evals are separate and use actual model/memory configuration. Their synthetic fixture may be retained by active memory hooks. The full fixture suite remains pending an appropriate test-data policy; do not change or temporarily override the existing bank to make it run.

## Constraints to preserve

- **Keep `HINDSIGHT_BANK_ID=turas` unchanged**, including command-level overrides. Preview memory isolation remains unresolved; agree that design before provisioning a different resource.
- Preserve `agent/agent.ts` and Turi's chosen runtime model. Switching IDEs or implementation models does not request a Turi model change.
- Turi serves customer engagement management. Customer/provider name collisions must never initiate connector setup.
- Use synthetic data and fictional customers for interview business records; do not import employer-confidential material.
- Keep login and chat history in the pre-demo scope. Research must cover adoption/customer success/value as well as technical solutions.
- Read installed Eve docs before adding tools, channels, connections, or subagents. Keep the current framework/protocol and avoid unrelated dependency changes.
- Explain implementation choices so the owner can understand and maintain them. Hosted resource changes and deployment still require the applicable authorization; this handoff does not perform or authorize them.
- Update the roadmap statuses only when implementation and the stated validation actually exist. Preserve the distinction between local tests, Preview validation, and release.
