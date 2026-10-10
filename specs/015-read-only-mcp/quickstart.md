# 015 Validation and Release Guide

Implementation validation guide: the commands below now exist. Acceptance evidence
is recorded separately; no hosted MCP behavior is claimed. Use the canonical core checkout;
never create sibling worktrees or run tests against selected Preview/Production.

## Implementation prerequisites

Select `SPECIFY_FEATURE_DIRECTORY=specs/015-read-only-mcp`, Node 24, current main
and proposed 055 availability. Read current installed Next route and eve docs before
code, pin reviewed official MCP server/client 2.3.1 and license/lockfile. Preserve
`agent/agent.ts`, selected `.env.local` and `.eve/.workflow-data` byte-for-byte.
Use confirmed `server/discover` and pin client version negotiation explicitly
to 2026-07-28 (the SDK default still requests the legacy era). No legacy handshake, OAuth or universal-client claims.

## Owned complete gates

Complete commands:

```sh
npm run typecheck:mcp
npm run test:mcp
npm run build:mcp:check
npm run mcp:consumer:check
npm run mcp:ui:check
npm run mcp:recovery:check
npm run benchmark:mcp
npm run test:mcp:regressions
npm run check:docs
```

Every runner owns a labelled disposable local PostgreSQL environment, synthetic
identities/private store/workflow paths beneath ignored `local-artifacts/015/`, and
cleans only resources whose ownership marker matches. Root selected environment is
neither source nor test target. Full canonical suite discovery rejects missing,
filtered, skipped/flaky cases and source changes; development filters never prove
acceptance. No live provider key or paid dispatch is needed.

## Consumer and access scenarios

Use the pinned real SDK client against the owned HTTP route, with manually
configured ephemeral Authorization headers. Exercise all twelve allowlisted tools,
current body/header version/method/name agreement, disallowed Origin/Host, unknown
method/version/operation, request and response bounds. Test internal admin/member,
assigned partner, peer, inactive member/org/workspace and foreign environment.

Prepare separate scoped credentials for the same actor, not only different actors.
Check customer/category narrowing, cursor/citation swapping, 15-minute expiry,
exact expected revision changes, pending/withdrawn/conflicted sources, sanitized
shared knowledge from another customer, current accepted plans vs new drafts and
published reports vs drafts/corrections. Workers remain stopped for synchronous
withdrawal/denial checks. Browser logout preserves independently authorized MCP;
credential revoke/expiry and current membership/grant loss stop the next read.

Race revocation/source withdrawal with final serialization under real transactions;
verify no unauthorized prose is emitted after the applicable fence. Record that
already delivered bytes cannot be recalled. Compare frozen output schemas with
shared domain policy, and demonstrate zero domain changes/embeddings/models/files/
sends for every unknown/forbidden operation. Do not use protocol mocks as consumer
compatibility proof.

## Management and browser scenarios

Four CLI WebKit configurations (desktop/mobile × light/dark), actual owned server:
create explicit reviewed scope, copy/dismiss one-time secret, uncertain creation
acknowledgment with no secret replay, owner revoke, peer denial, canonical admin
revocation, expiry, changed customer visibility and settings navigation. Verify
keyboard/focus, no overflow and axe zero serious/critical findings. Inspect local/
session storage and telemetry for secret/private payload absence; synthetic visual
captures must never contain a credential, and inspect safe screenshots in both
themes/viewports. Host browser operation is prohibited.

## Recovery, pacing and release

Run empty migration and exact 054→055 upgrade with explicit runtime grants; preserve
all preexisting rows and verify no handlers create schemas. Test schema-not-ready,
operator disabled, restart/cleanup outage, independently committed quotas, lease
expiry, idempotent cleanup and unknown admission. Test learning activation under
verified 054/055, preserving owner/environment gates. Run all shared actor/browser/
native domain regressions, then five classes ×100 quota-paced positive reads with
p95 <1000ms; report quota waits and over-limit trials separately. No bypass fixtures.

Source-bound CI must pass every mandatory gate before merge; inspect completed
results explicitly, not `--auto` assumptions. After separately authorized merge:
back up/rehearse exact selected target, apply 055/grants in compatibility-safe order,
verify disabled deployment commit/schema/environment, then explicitly enable.
Create disposable operator-owned scoped MCP credentials only as necessary for
available real-record read checks; revoke them afterward. Run authenticated HTTP,
real SDK consumer and CLI WebKit checks for available internal/partner boundaries
and management. No synthetic customer data, paid model work or grant fabrication.
Record missing record-dependent coverage honestly. Confirm no secret remains in
artifacts and preserve local selected environment; private evidence is ignored.

Rollback exposure by disabling and revoking, with revocation/reconciliation still
operable; do not downgrade schema/drop customer data or reactivate revoked access.
Record exact commit/deployment/schema, independent capture limitations, cleanup and
remaining hosted coverage. Delete merged feature branches and verify README on main.
