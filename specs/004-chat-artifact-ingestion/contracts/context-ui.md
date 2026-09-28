# Attachment context and UI contract v1

## Draft send and tool behavior

Extend the governed send command with an ordered list of explicit owned version/
run/unit-range references, separate from text. Same request key with a different
list conflicts. Validate five versions/25 MiB originals and the draft text/unit
budget before send; no silent truncation. Preserve existing native message text
and its receipt digest; add a canonical request digest for text plus selections.
For a file-only turn, use a fixed visible owner-confirmed prompt such as “Summarize
these selected attachments as unverified input.” Do not secretly inject a user claim.

The domain service builds artifact-context-v1 with source IDs, exact locations,
coverage, digest and labeled unverified content, separately from customer-context-v1.
Accepted customer-context-v1 snapshots carry accepted claim payloads and source
IDs/attestations, never raw artifact excerpts. Approved excerpt display is an
authorized UI projection of purgeable content; broader source retrieval stays 005.
Record the injection receipt against attempt/session identity; model steps verify
both envelopes. Context is loaded only through the governed artifact domain, never
through raw eve file uploads, arbitrary file paths, network URLs or model SQL.

A new artifact_context tool reads only already selected units for the bound owner,
customer and attempt, within the same 12,000-character/20-unit total attempt budget.
Repeated identical reads replay the same bounded receipt; different subsets cannot
expand the budget. Turi may explain/summarize with exact citations and uncertainty.
Only an explicit retain-context request can call the existing proposal tool's new
artifact selection support; it creates Pending/manual/artifact_share. The tool has
no approve action. OCR confidence is extraction uncertainty, not reliability.

Instructions mark all source content as inert quoted data. Embedded instructions
cannot change scope, invoke actions, execute formulas, grant rights or approve
claims. Existing tools keep their bound actor checks. No raw files go to the model;
only authorized extracted selections. Review actual responses against prompt-
injection, unsupported claim and citation-fidelity cases.

## Whole-conversation release fences

Persist the union of consumed artifact dependencies across every turn. Removing
chips or detaching references never removes these dependencies. Before every model
step/tool read/output chunk/native rewind/reconnect/history/title projection,
validate current actor/customer authority and each source version/run/generation.
Use existing context-fence transactions and lock ordering for linearizable release.

Withdrawal/deletion or access loss permanently stales an affected native session;
do not refresh it into validity with different selections. Hide generated/private
draft history and titles, retain exact owner-entered text where current private-chat
rules allow, and offer a fresh chat. Fresh same-owner/customer chats may explicitly
reattach still-eligible sources without copying prior native/compacted history.
Native clear/reset retirement is retried but not required for immediate denial.
Provider-held durable rewind records are not claimed physically erased.

Review/correction/withdrawal reuses 003's customer generation invalidation. Source
eligibility includes exact selection support so accepted claims with withdrawn
source are unsupported and excluded transitively. An older published version
remains eligible during replacement unless explicitly withdrawn. New approvals
must bind the new exact selection; no silent migration.

## Interaction contract

Preserve current Geist/neutral design and reference attachment affordances.

1. Chat must be customer-bound before upload; show the explicit customer and
   optional workload. No file-name/content inference. Unbound composer opens the
   existing customer picker.
2. Attachment button and drag/drop offer supported formats and limits. Removable
   chips show sanitized name/type/size, progress and live status. Preserve unrelated
   typed draft and next-turn selections during uploads/sends. Keyboard focus and
   screen-reader status remain meaningful.
3. Chips progress through upload, quarantine, processing and ready/partial/error.
   Poll every 2 seconds only while foreground/pending; refresh immediately on focus.
   Scanner unavailable/stale gives a useful retry/setup state, never “ready”.
4. Source viewer renders escaped text/tables with exact locations and coverage.
   Formulas/cache are separate; hidden-sheet/row and OCR warnings stay visible.
   No raw HTML/Markdown execution, embedded Office viewer or arbitrary image URL.
5. Owner selects units/ranges within the displayed budget. Large files require an
   explicit bounded selection; offer first units as a visible editable suggestion,
   never silently present them as the whole file. Blank sources have no select/send.
6. “Propose as customer context” previews exact claim, excerpt, numeric citation,
   classification and source dates/quality inputs. Explicit submission states that
   current stewards/admins can inspect the original. Existing review UI displays
   this exact snapshot; acceptance shares only the permitted excerpt.
7. Partner profile view shows accepted delivery excerpts from any contributor plus
   own Pending/rejected submissions; no other contributor's draft file metadata.
8. Distinguish Remove from message, Detach from this chat, Withdraw source and Delete
   source. Published replacements are separate versions. Submitted-source destructive
   actions require steward/admin, exact version and reason. Show which dependent
   accepted claims become unsupported and explain retained claim history.

All actions have loading/empty/error/retry states and accessible labels/live status.
Validate light/dark at 390px and 1440px through CLI WebKit; no horizontal overflow,
keyboard-only selection/review/removal, visible focus, correct escape/return focus
for dialogs. Downloaded originals use authenticated attachment responses only.
