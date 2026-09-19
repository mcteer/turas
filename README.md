# turas-agent

This is an [eve](https://eve.dev) agent bootstrapped with [`eve init`](https://eve.dev/docs/reference/cli#eve-init).

For current implementation status, read [the evidence audit](docs/EVIDENCE_AUDIT.md) and [release validation](docs/RELEASE_CHECKLIST.md). [HANDOFF.md](HANDOFF.md) and [ROADMAP.md](ROADMAP.md) preserve the original planning baseline and deferred production scope.

The presentation scenario, fixed synthetic data contract, and walkthrough are in [docs/DEMO.md](docs/DEMO.md). Use [docs/RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md) before a hosted release.

## Getting started

Run the Next.js web application:

```bash
npm run dev
```

For the separate Eve development TUI, use `npm run dev:eve`.

Start by editing `agent/instructions.md` to define the agent's identity, purpose, tone, and response guidelines. Configure its model and runtime behavior in `agent/agent.ts`.

Add capabilities under `agent/`, including tools, connections, channels, skills, subagents, and schedules. eve reloads your changes as you work.

## Local checks

Use the Node version in `package.json`, then run `npm run typecheck`, `npm run test:unit`, and `npm run test:ui`.

The UI suite uses Playwright WebKit and starts or reuses the app at `http://127.0.0.1:3100`. Install the matching browser with `npx playwright install webkit` if it is absent. On macOS, the test configuration selects Playwright's bundled framework explicitly to avoid a system-WebKit launch error. Other platforms use the standard launcher. See [Playwright browser installation](https://playwright.dev/docs/browsers).

UI tests intercept Eve requests: they exercise attachments and error handling without calling a model or writing memories. They do not change `HINDSIGHT_BANK_ID`. Live routing evaluations are separate (`npm run eval -- --tag customer-routing`) and use the configured environment and memory bank; run those only against the intended target.

Customer evidence at `/customers` and Turi share a [reviewed public snapshot](docs/CUSTOMER_EVIDENCE.md), separate from the fictional financial portfolio. Public sources do not establish formal maturity or internal engagement state.

Customer-engagement chat does not initiate connector onboarding. `agent/tools/connection_search.ts` guards generic provider discovery; the account resolver separates public evidence from fictional scenarios and is not a CRM integration. Existing connection grants retain user scope, but missing grants do not launch a sign-in flow. Account-source integration is scoped in `ROADMAP.md` (D4); provider names are not customer records.

## Eve resources

To learn more about eve, explore these resources:

- [eve documentation](https://eve.dev/docs) — learn about eve's features and authoring APIs.
- [Build an Agent tutorial](https://eve.dev/docs/tutorial/first-agent) — build and deploy an agent step by step.
- [eve on GitHub](https://github.com/vercel/eve) — view the source and contribute.

## Deploy on Vercel

Deploy your agent to [Vercel](https://vercel.com) from the project root:

```bash
eve deploy
```

`eve deploy` links a Vercel project if needed and deploys the agent to production. See the [eve deployment documentation](https://eve.dev/docs/guides/deployment/vercel) for authentication, environment variables, and deployment options.
