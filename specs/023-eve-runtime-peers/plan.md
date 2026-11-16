# Implementation Plan: Eve runtime peer maintenance

**Branch**: `023-eve-runtime-peers` | **Date**: 2026-11-16 | **Spec**: [spec.md](spec.md)

## Summary

Implement PR #56 peer updates with the new SDK's effective content filtering wired
into direct research calls. Keep the native Eve runtime/model and domain policies.

## Technical Context

Node24, TypeScript7, Next16.4.3, Eve0.91.0, AI7.0.172, Connect2.9.2, PostgreSQL/schema86.
Vitest installed-SDK synthetic providers and diagnostic subscribers establish local
contracts; existing CI and authenticated CLI WebKit establish separate hosted evidence.
No data migration or runtime grants changes. No new integration or dependency beyond the two updates.

## Constitution Check

Pre-design PASS: dedicated spec precedes edits; FR-002 selects actual privacy capability
adoption; research records exclusions. Domain authority, accounting and evidence eligibility
are unchanged. Post-design PASS: no customer payload telemetry or speculative integration.

## Structure and Phases

1. Assess releases and native error/stream boundaries in research.md.
2. Add lib/server/models/telemetry.ts with shared input/output recording disabled.
3. Use the policy in specialist decision-workflow.ts, independent-search.ts and
   scripts/research-public-customers.ts. Embedding telemetry already opts out.
4. Pin package.json/package-lock.json and add installed-SDK privacy regressions in
   tests/unit/runtime-peer-telemetry.test.ts; run existing budget/privacy contracts.
5. Record local evidence; update README.md/ROADMAP.md and prepare a reviewable PR.

## Delivery and Recovery

No schema/state conversion. Preserve local database, .eve and selected model.
Require complete CI and authenticated Preview profiles check, inspect WebKit captures,
obtain maintainer review before merge. Verify Production source/schema and changed
research/privacy/conversation behavior after release. Roll back code/lockfile together
to the prior known deployment; never discard unknown usage holds or retained history.
