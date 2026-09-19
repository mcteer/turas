# Turas release checklist

## Required production configuration

- `TURAS_DEMO_USERNAME` and `TURAS_DEMO_PASSWORD`: owner credentials.
- `TURAS_DEMO_REVIEWER_USERNAME` and `TURAS_DEMO_REVIEWER_PASSWORD`: reviewer credentials.
- `TURAS_SESSION_SECRET`: unique high-entropy production signing secret.
- `DATABASE_URL`: pooled Neon connection for the isolated database containing only synthetic records and metadata. The app applies its versioned `turas_schema_migrations` records on first use; use the direct Neon URL for any future operator-run migrations.
- AI Gateway and Eve runtime configuration required by the existing deployment.

Do not reuse Preview credentials, database, memory resource, or external grants in Production. Do not enable `TURAS_ENABLE_CONNECTORS` for the interview runtime.

Preview intentionally disables Hindsight-backed recall unless it receives its own approved, isolated memory configuration. Do not copy the Production Hindsight credentials or bank into Preview.

## Smoke test after deployment

1. Visit `/login` in a clean browser and verify an invalid password remains on login.
2. Sign in as reviewer; confirm Portfolio review, engagement evidence, and What-if preview load.
3. Verify a reviewer cannot approve the intervention.
4. Sign in as owner; approve, reject, or defer the synthetic action with a rationale and verify the decision entry persists after refresh.
5. Start a chat, return to it through Recent conversations, rename it, and archive it.
6. Open a second user session and verify a copied conversation URL cannot be resumed.
7. Ask Turi about an unknown engagement and verify it asks for evidence without offering a connector or sign-in flow.
8. Record the production URL, commit SHA, deployment time, and results below.

| Commit | URL | Tested at | Owner | Result |
| --- | --- | --- | --- | --- |
| _pending_ | _pending_ | _pending_ | _pending_ | _pending_ |

## Interview-readiness verification (2026-09-19)

- Added the annual Services operating plan, shared Turi calculator, commercial-review skill, and ten-question preparation guide.
- Local unit checks: ten pass, including annual cost coverage, utilization losses, zero denominators, capacity feasibility, and per-engagement cost regression.
- Live local Eve evaluations: seven pass, 39 gates; production Hindsight disabled for the run. These cover customer/provider routing plus annual economics, protected capacity, and additive intervention effort. They do not prove hosted approval or persistence.
- Typecheck and Webpack production build pass. Browser checks cover login title fit at 320/390/768/1440px, protected operating-plan navigation, scenarios and invalid inputs, non-pilot economics, and mobile/desktop layouts. Screenshots are inspected with Playwright.
- Hosted Preview still lacks database/login/session configuration at the configuration check. Keep production promotion gated on the full rehearsal and the ownership/idempotency hardening identified in `ROADMAP.md`.

## Preview validation record

| Commit | URL | Tested at | Result |
| --- | --- | --- | --- |
| `2ea923e` | `https://turas-849rt8r9j-turas-6e414af3.vercel.app` | 2026-09-19 | Hosted build ready; protected `/login` returned 200 through Vercel's scoped bypass; Analytics runtime rendered. Full login, persistence, and decision rehearsal await Preview-only demo credentials, `TURAS_SESSION_SECRET`, and `DATABASE_URL`. |
