# Implementation Plan: Dependency maintenance

**Branch**: `021-dependency-maintenance` | **Date**: 2026-11-02 | **Spec**: [spec.md](spec.md)

## Summary

Consolidate assessed PR53–59, add the missing Next security update and compatible transitive fixes, and adopt boolean credential validation, interrupted-provider accounting fences and artifact digest enforcement. Assess historical source and Vercel resources separately; preserve uncertain unique work and recovery material.

## Technical Context

TypeScript7/Node24, Next16.4.3 with matching environment loader, existing Eve0.91.0 and unchanged agent model. Zod4.6.7, AI7.0.158, Connect2.6.0, development versions from PR57, immutable setup-node7.1.0/download-artifact8.0.2 pins. Existing schema85/PostgreSQL, private Blob stores and Workflow data; no migration/grants changes. Vitest, complete existing CI, CLI WebKit and real authenticated Preview/Production acceptance. Existing cost ceilings, expiry, uncertain holds and default firewall remain.

## Constitution Check

Pre-design and post-design PASS: dedicated specification and capability adoption precede implementation; shared authorization/parser boundaries remain. No speculative connector, model, schema or identity change. No override across a transitive major boundary without consumer compatibility evidence. Maintainer review and actual hosted acceptance remain release requirements.

## Project Structure

- Root and renderer package manifests/lockfiles: assessed versions and compatible patch constraints.
- `lib/server/mcp/credentials.ts`: `.validate()` only for a transform-free syntax predicate.
- `lib/server/research/specialists/discussion-provider.ts`: interrupted finishes cannot establish completion/settlement.
- `.github/workflows/ci.yml` and `legacy-backend-parity.yml`: immutable action pins, explicit digest error policy, existing attempt/producer/completeness fences.
- `tests/unit/dependency-maintenance.test.ts`: real wrapped provider and credential-boundary regressions, no paid work.
- This spec directory: dispositions, acceptance contracts and actual validation.

## Delivery and Recovery

Inventory → release/capability review → narrow implementation → regression/type/unit/extractor/build/audit checks → replacement PR → complete up-to-date CI and real authenticated Preview → maintainer review → merge → exact Production identity/schema and authenticated HTTP/WebKit → evidenced branch/PR cleanup. Keep originals until replacement delivery. No schema rollback is needed; preserve verified deployment rollback and recovery custody. Remove stale branch overrides only after their acceptance/resource dependencies are checked. Do not force-merge to finish cleanup.
