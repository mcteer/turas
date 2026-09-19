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
