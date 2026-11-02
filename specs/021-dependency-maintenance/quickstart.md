# Validation and release

Run npm ci in root/extractor/renderer, maintenance regressions, typecheck, unit tests, extractor tests, build:check, selector/docs checks and audits for all three projects. Capture detailed outputs privately.

Open replacement PR, require complete up-to-date CI and maintainer review. Run preview:credentials:check and profiles:preview:check against exact Preview SHA with existing protected credentials; inspect desktop/mobile WebKit captures. No synthetic response substitution.

After passing acceptance, merge and verify canonical deployed commit/schema and authenticated HTTP/WebKit behavior. Preserve rollback and all recovery custody. Record actual evidence in validation.md, then retire superseded original PRs/branches and proven stale overrides. Do not claim hosted acceptance from local tests.
