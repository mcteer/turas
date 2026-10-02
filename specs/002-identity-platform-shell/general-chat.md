# General technical chat and legacy landing correction

## Scope and specification

The 2026-10-02 user correction authorizes general technical questions without a
customer. New Chat defaults to no customer, including after prior customer chats.
Explicit customer links may preselect one. Preserve the legacy centered Turi title,
real message composer, attachment and circular send controls. Place optional
customer selection beneath and outside the composer. Customer research, plans,
claims and attachment details open on request instead of occupying every chat.
Customer attachments require explicit customer scope; general chat must never
invent a customer or retrieve customer material.

## Plan

Migration 035 permits nullable customer scope only with general-context-v1.
General conversations retain workspace and environment ownership, live session,
membership and partner organization checks. Bounded append-only context receipts
and matching native-turn injection receipts guard model steps. Existing customer
tools reject general scope in the server domain. The original selected model,
customer grants and evidence approval rules remain unchanged.

The landing creates and binds a private conversation, transfers the first draft
through owner-browser session storage (no question in URLs), and consumes it once.
Native request keys retain existing replay and uncertain-dispatch protections.
Existing worker readiness and watchdog requirements still apply to every send.

## Tasks and acceptance

- [x] Implement nullable scope, private list/read, idempotency and live actor checks.
- [x] Bind and inject bounded general context; deny customer tools and selections.
- [x] Restore landing composition and optional context placement; default unscoped.
- [x] Hide dense customer actions behind an accessible disclosure.
- [x] Verify general admission, ownership, replay, tool denial and revocation locally.
- [x] Validate desktop/mobile and light/dark layout using CLI WebKit captures.
- [x] Verify production build and record Preview/runtime limitations precisely.

## Integration note

Unmerged feature 008 in the original checkout already has draft migrations 035–037.
Before integrating it, renumber its unapplied migrations after this 035 and update
its manifest/schema gates. Do not alter or apply those interrupted draft files in
this correction. Preview schema migration and deployment are separate from a
Production release. A UI or contract check does not prove hosted model execution.
