# Customer Profile bug-fix validation

Validated locally on 2026-10-14. This is a bug-fix release under the existing
customer-profile and evidence contracts, with no new feature specification.

The directory now supports authorized customer-name search and direct profile
navigation. Profiles show a themed maturity, risk and active-delivery overview,
business description and attributed known products. Missing maturity or risk stays
unknown; engagement state does not determine customer maturity.

Checked independent research is accepted factual context without human review.
Human-entered claims retain their review requirement. Original source dates,
scope, attribution, authorization, withdrawal and material-conflict exclusions
remain enforced. The separate `current_fact` mode retains decision-quality and
freshness requirements.

## Results

- Focused summary, search, research acceptance and delivery checks: 6 passed.
- Existing unit suite: 484 passed across 108 files, using synthetic configuration.
- Affected context, research and retrieval integration regressions: 19 passed.
- Production-build browser checks: 48 passed across four WebKit configurations;
  zero skipped, retried or flaky cases. Includes accessibility, responsive layout,
  navigation, customer search, source attribution and evidence-search checks.
- TypeScript and authored-document checks passed. Desktop dark and mobile light
  overview captures were inspected visually.

The browser run preceded the final conflict-exclusion refinements; those changes
were verified by the focused and affected integration checks. Test resources were
isolated, synthetic and removed after validation. No model evaluation was run.

No migrations or runtime grants are required. The branch suppresses automatic
Preview deployment. These results establish local behavior only: deployed commit,
schema compatibility and authenticated Production workflows must be checked after
an approved merge and release.
