# Feature Specification: Legacy chat interaction parity

**Feature Branch**: `019-chat-interaction-parity`
**Created**: 2026-10-16
**Status**: Released
**Input**: “I don't feel like the chat interface and flow work the same as they did in legacy. I need that fixed. … I love the current look, I don't love how it works.”

## User Scenarios & Testing

### User Story 1 — Compose and continue naturally (Priority: P1)

As a user, I can send text, files or links, keep typing a follow-up during a response, answer a question and stop work without fighting the composer.

**Why this priority**: The composer is the primary interaction on every turn.
**Independent Test**: Exercise new and existing conversations, keyboard submission, file paste/drop, follow-up steering, pending questions and Stop with controlled responses.

**Acceptance Scenarios**:
1. Enter sends once; Shift+Enter inserts a newline; composition input never submits early. The draft clears for the accepted send while a subsequent draft survives completion.
2. A running ordinary response leaves the composer usable: an empty draft offers Stop and a nonempty draft offers Send. Preparing or stopping prevents duplicate submissions.
3. File picker, pasted files and dropped files use the same intake limits and removable attachment state. Links remain part of the prompt and are inspectable/removable before sending.
4. Pending questions/decisions appear with their prompt and exact options. Thinking stops while awaiting the user; responses never imply that a decision is already approved.

### User Story 2 — Follow the response and inspect its work (Priority: P1)

As a user, I see meaningful progress while work is running and can read earlier content without being pulled back to the bottom.

**Why this priority**: Hidden work and lost reading position make working chat feel stalled or unstable.
**Independent Test**: Stream text and tool activity, resize content, scroll away, return to latest and reload at a saved position.

**Acceptance Scenarios**:
1. Live text and late layout changes follow the bottom only while the user is following; scrolling up preserves position and offers a keyboard-accessible Scroll to bottom action.
2. Reload restores the same conversation's reading position, including when history arrives asynchronously. Switching conversations keeps their positions separate. Storage failure does not break chat.
3. Active tool work is visible; completed tools remain inspectable without overwhelming the answer. Reasoning is visible while it is the only progress and recedes after answer text appears, matching legacy behavior.
4. Loading, initial thinking, background work, waiting for a reply, stopping and failure are distinct. Empty assistant shells do not create blank bubbles; settled success does not leave stale submission notices.

### User Story 3 — Retain the current design and governed behavior (Priority: P1)

As a user, I keep the current visual design, private conversation history and safe recovery behavior while interaction parity improves.

**Why this priority**: The user explicitly likes the current appearance; parity must preserve the restored backend.
**Independent Test**: Compare desktop/mobile in both themes, reload and switch conversations, and exercise owner denial, interrupted sends and current-source checks.

**Acceptance Scenarios**:
1. Existing typography, colors, spacing, bubble treatment and navigation remain; added controls use that design system.
2. Reconnect never resends an uncertain message, clears unknown holds or restarts work; native streaming remains the current supported equivalent of legacy polling.
3. Access denial/current-source changes clear protected display state. No private event/content cache is added to browser storage.

### Edge Cases

Slow history; images/fonts changing height; manual scroll during streaming; mobile keyboard; reduced motion; unavailable browser storage; rapid double-submit; asynchronous upload; rejected question response; terminal callback arriving before a send promise resolves; multiple pending questions; missing tool inputs; retained-only history.

## Requirements

### Functional Requirements

- **FR-001**: Audit legacy chat entry points, message rendering, composer, attachment intake, controls, scrolling and reconnect; give each behavior a current disposition and regression evidence.
- **FR-002**: Preserve Enter/Shift+Enter/composition semantics, fresh follow-up drafts, ordinary steering, Stop and explicit input responses with single-delivery guards.
- **FR-003**: Restore file picker/paste/drop and link inspection/removal through the existing governed attachment intake and limits.
- **FR-004**: Follow streamed and resized content only while following latest; provide jump-to-latest and per-conversation scroll restoration without storing message content.
- **FR-005**: Render authorized tool/reasoning progress, inspectable completed work and actionable questions/authorization in their conversation context; suppress blank shells and contradictory progress.
- **FR-006**: Keep current design, root model, authorization, source eligibility, idempotency, recovery bounds and provider accounting unchanged.
- **FR-007**: Verify meaningful interaction regressions with command-line headless WebKit on desktop/mobile in both themes; verify exact Preview and Production commits before release completion.

### Key Entities

- **Conversation viewport**: conversation identity, reading position and whether following latest; contains no message content.
- **Composer draft**: unsent text/files/links, preparation and send guard; separate from an admitted turn.
- **Visible activity**: authorized tool/reasoning state and pending user requests, separate from execution authority.

## Success Criteria

- **SC-001**: Every audited legacy chat interaction has an implemented equivalent or an explicit current-policy adaptation, with zero unexplained gaps.
- **SC-002**: All acceptance journeys pass across desktop/mobile and both themes without unintended sends, draft loss or scroll jumps while reading.
- **SC-003**: Questions, running work, stopping and failures display distinct states; settled turns leave no stale waiting/submission state.
- **SC-004**: Current design is retained and changed behavior passes authenticated hosted checks on the deployed revision.

## Assumptions

- Legacy reference is read-only `../turas-back` at `fd1e205d7fd258676d6fb12b3ade8a431d53a6af`.
- This is interaction parity, not a redesign or a runtime/model migration. Current owner/source fences and explicit decision rights take precedence over old demo shortcuts.
- Existing continuous native streaming replaces legacy polling; no redundant resume loop or private browser message cache is required.
- No new database schema, external integration or automatic model-budget increase is needed.
