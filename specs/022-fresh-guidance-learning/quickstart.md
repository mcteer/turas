# Validation quickstart

Use Node24 with Docker available. Do not load .env.local or use selected application
data. The committed runner creates and removes owned loopback databases and uses
synthetic fixtures; no app/model start is needed for the domain tests:

```sh
npm run test:guidance
node --import tsx scripts/check-guidance-migration.ts
npm run typecheck
npm run check:docs
```

The migration command is also included in test:guidance and the MCP deterministic
CI job. On this host, `/opt/homebrew/opt/node@24/bin/node --import tsx
scripts/test-guidance.ts` uses the pinned Node version directly.

Retrieval/persistence checks use withLearningEnvironment and a distinct test URL
application_name. Plans run in its owned006 clone; MCP checks use withMcpEnvironment.
The migration rehearsal starts at85 with populated retained references, backs up
and restores, applies86, verifies conservative backfill and runtime grants, then
restores/reapplies runtime grants/restarts and checks again. Each Vitest suite family
runs in a fresh process. Reapplying grants after restore is required because owner
default privileges can broaden permissions on recreated tables.

Expected: two actual cleanup ticks remove 101 eligible copies; current/recently
retired controls remain; seven-day and earlier-deadline cases reject current use;
history remains readable; expired product passages do not consume ranking slots.
Run existing cache lifecycle and source-fence regressions for reuse/withdrawal.

Run repository typecheck under Node24 after edits. Record representative agent
cases (recent reuse, old support, no newer results, missing account and denied budget)
separately from actual-model/hosted acceptance. No local mock proves deployed behavior.
