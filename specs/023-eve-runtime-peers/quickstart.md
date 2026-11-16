# Validation Guide

Use Node24 and the checked-in lockfile. No paid provider or selected database is needed
for unit checks. Preserve .env.local and .eve.

```sh
npm ci
npx vitest run tests/unit/runtime-peer-telemetry.test.ts tests/unit/dependency-maintenance.test.ts
npm run typecheck
node --env-file-if-exists=.env.local node_modules/vitest/vitest.mjs run tests/unit --exclude 'tests/unit/execution-*.test.ts' --exclude 'tests/unit/gap-*.test.ts' --exclude 'tests/unit/partner-*.test.ts' --exclude 'tests/unit/pilot/**'
npm run build:check
npm run check:docs
npm run preview:credentials:check
```

Expected: content-free telemetry, unchanged application results, preserved interrupted
holds, both builds pass. See validation.md for actual checks and broader focused coverage.
Full CI and authenticated Preview customer profiles/WebKit, maintainer review and exact
Production release verification are separate required gates from CONTRIBUTING.md.
