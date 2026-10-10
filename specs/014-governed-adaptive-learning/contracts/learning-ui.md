# Learning UI Contract

Follow `docs/design-reference.md`: existing shell, Geist, neutral surfaces,
restrained cards/tables, title-case labels, desktop/mobile and both themes. No
customer identifiers, private evaluation fixtures or technical implementation
metadata appear in ordinary shared-practice views.

## Journeys

- Add **Give Feedback** to an eligible shared practice and authorized report, gap
  observation, partner guide or own checkpoint detail. The dialog names only the
  accessible target, explains that feedback is proposed, accepts a category and
  bounded observation, and returns focus to the trigger. No attachments/chat mining.
- `/learning` shows **My Feedback** to partners and an internal **Review Queue**,
  **Practice Candidates**, **Outcome Trends** and **Learning Health** to internal
  users. Partner navigation has no aggregate/dashboard links; server denial remains
  mandatory for direct URLs. Feedback author sees only safe disposition status.
- `/learning/feedback/:id` displays authorized feedback and its history. Internal
  stewards can link a candidate, defer or dismiss with a rationale. Author edits
  create a new revision; stale commands require refresh, preserving unsent text only
  in the current page's memory until access is lost.
- `/learning/candidates/:id` reuses the existing knowledge editor and review details.
  Show original eligibility privately, proposed wording, rights/minimization review,
  current baseline and review/evaluation eligibility. **Draft Improvement with Turi**
  requires explicit selected inputs and a USD cap. Progress/Stop/unknown-cost states
  are visible; output has **Save Proposed Revision**, never an approval shortcut.
- `/learning/evaluations/:id` shows all eight baseline/candidate pairs and explicit
  executed/withheld/failed/missing statuses. Administrators review exact captures
  with four dimensions and mandatory safety/citation/authority checks. The page
  explains what prevents publication and never defaults a review checkbox to pass.
- **Publish Reviewed Version** performs the existing 005 decision with the exact
  passing evaluation. **Withdraw Published Version** stays available when newer
  drafts exist. **Prepare Rollback Revision** states that a new review/evaluation is
  required; it does not restore a previous publication immediately.
- **Outcome Trends** offers only the two fixed metrics and completed quarters. Show
  the signed mean change, unit, windows and noncausal limitation, or a uniform
  unavailable state. No cohort size, customer links, hidden counts or arbitrary filters.
  Authorized internal reviewers manage measurement proposals on a separate private
  queue; it cannot be reached by drilling into aggregate membership.
- **Learning Health** separates evidence quality, evaluation readiness and operations.
  Distinguish original evidence dates from review recency. Disabled, due, unknown,
  failed and withheld states have useful next actions within current authority.

## Revalidation and failures

All protected reads use no-store and current domain authorization. Clear protected
bodies before refresh and on session/access/generation changes; abort old requests
and ignore late responses using a request generation. Revalidate on navigation,
window focus and mutation, and while a visible paid attempt is active. Use the
existing bounded feature polling pattern; no prose or credentials in localStorage,
URL parameters, page titles, analytics or service-worker caches.

Client persistence may store opaque request identity/generation only. Lost mutation
acknowledgment offers **Check Request Status** then explicit abandonment; never
silently resubmit paid work or publication. Failures distinguish authentication,
stale review, unavailable prerequisites, budget exhaustion and unknown provider work.
Known schema absence produces a useful unavailable page, not a generic server error.

CLI WebKit acceptance covers keyboard and dialog focus return, labels/status live
regions, contrast, long content, no horizontal overflow at 390px, light/dark at
1440px and 390px, source/access loss with a page open, stale responses, replay,
Stop and reconciliation. Use only synthetic screenshots; no host browser or private
Production screenshots in commits.
