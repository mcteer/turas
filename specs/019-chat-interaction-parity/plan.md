# Implementation Plan: Legacy chat interaction parity

**Branch**: `019-chat-interaction-parity` | **Date**: 2026-10-16 | **Spec**: [spec.md](spec.md)

## Summary
Restore legacy interaction mechanisms within the existing visual shell: responsive scroll following/restoration, visible tool/reasoning activity, consistent composer intake and truthful state transitions. Preserve governed backend mechanisms from018.

## Technical Context
TypeScript/Node24, Next16/React19, installed Eve0.67.1 and existing Playwright WebKit. No new dependency, provider integration, database migration or root-model change. Browser storage contains only numeric scroll coordinates and follow state; authorized content remains server-owned. Owned disposable test environments preserve selected database and workflow storage.

## Constitution Check
Pass before and after design: bounded spec and traceability; no change to evidence acceptance or human decisions; server authorization remains authoritative; current Eve continuous streaming retained; headless UI verification and exact hosted release checks required. No exceptions.

## Architecture
- Add a reusable conversation viewport with ResizeObserver, near-bottom intent, per-conversation restoration and an accessible latest control. Defer restore until async content can accommodate the saved position, avoiding a bottom flash or overwriting a saved position with the initial empty view.
- Render current authorized native tool/reasoning/authorization parts. Preserve activity alongside canonical retained prose, without feeding display history into the execution reducer. Pending question controls use existing exact request identity and approved action preview.
- Keep the current composer and style. Route picker/paste/drop through one attachment intake. Represent URL chips from prompt text without changing the prompt contract. Guard concurrent send/preparation and ignore stale async notices after terminal events/newer operations.
- Separate waiting for user, resuming, thinking, background work and failure. Keep continuous Eve streaming rather than adding legacy's obsolete periodic resume calls.

## Project Structure
Changes are confined to app/_components chat/composer components, a viewport hook, lib/conversations display helpers, focused unit/UI tests and an isolated check runner. Existing domain services and native admission remain unchanged. Docs under this feature include source comparison, interface contract, test commands and release evidence.

## Delivery and Recovery
Run focused units, typecheck, docs/build and the owned four-project headless WebKit gate. Inspect captures. Open a focused PR, run required CI and exact authenticated Preview checks; independently review before merge. Verify exact deployed Production commit, logins and changed read-only interaction paths. No schema migration: previous schema77 backup/rehearsal remains valid. Rollback is the prior compatible app commit, without resetting data/holds.
