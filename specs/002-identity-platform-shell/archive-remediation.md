# Owner-private conversation archive

User requested an Archive option in Recent Conversations before feature 011.
Archive hides a chat from Recent Conversations without deleting messages, changing
its native session, granting access, or cancelling running work. Archived Conversations
supports title search and Restore. Direct owned history remains accessible under
all existing current-policy fences. Other principals, expired sessions and revoked
customer grants cannot archive, restore, list or read the record.

Implemented as explicit migration 044 (`archived_at`), an idempotent absolute-state
PATCH with origin/CSRF and owner/current-policy checks, and sidebar controls in
both desktop and mobile navigation. Archived and recent queries preserve paging.
Forward rollback: disable the controls and restore eligible owned records with
`archived_at=NULL`; retain all conversation content. Deploy only after explicit
migration, with no request-time initialization.

Validation: four API contract checks including archive/restore replay, cross-owner
and CSRF denial, retained history; four CLI WebKit journeys across desktop/mobile
and light/dark with keyboard and serious/critical axe checks; Node 24 typecheck
and Next.js production build passed. Existing Temporal bundler warnings remain.


Released in [PR 20](https://github.com/mcteer/turas/pull/20). Production WebKit
verification on 2026-10-08 UTC passed Archive, Restore and keyboard interaction
with zero serious/critical axe findings. The native binding remained unchanged;
the temporary owned verification conversation and session were cleaned up.
The merged feature branch was removed, and README was verified on main.
