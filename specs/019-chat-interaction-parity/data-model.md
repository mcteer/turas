# Presentation state

No schema changes.

- Viewport: storage key scoped to conversation, finite nonnegative scrollTop and boolean atBottom. Store no messages or URLs. State moves from awaiting history to restored, then follows only while near bottom; explicit latest action opts back in.
- Composer: unsent text/documents, preparing flag and synchronous send lock. Draft ownership ends when snapshotted for that send; completion never clears a newer draft.
- Operation notice: generation/operation identity, response terminal state and pending request. A late old promise cannot overwrite terminal or newer-turn state.
- Activity: existing EveMessage parts, pending request identity and canonical retained prose. Presentation-only supplementation cannot authorize inputs or change native events.
