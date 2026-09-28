# Profile and review UI contract

Use the existing Geist typography, neutral theme tokens, sidebar and compact cards
from `docs/design-reference.md`. Adapt layout ideas from the old profile/journey
screens; do not import their data, integrations, permissive fallbacks or stage enums.

## Navigation and profile

The customer directory links to `/customers/{customerId}` and retains Start chat.
The profile header shows accepted customer identity, synthetic marker and scope
selection. A pending proposed name is labeled separately. The overview has concise
cards for workload/product use, six independent maturity dimensions, delivery risks,
engagement references and next reviews. Sections expose evidence and history without
requiring the user to read raw payloads. No unused later-feature navigation.

Maturity stage and dimension states are separate from engagement phase. Each known
assessment shows scope, period, assessor, rubric, evidence, next capability and
review date. Unknown is explicit and no empty state creates a stage or product use.
Product-use badges distinguish actual/evaluating/planned/retired/unknown. Research,
accepted context, pending/rejected and stale/conflicted states have text labels.
Internal members can flag two accepted facts from the profile. Assigned stewards
can confirm a flagged contradiction and resolve it after one side is corrected or
retracted, citing a current accepted revision. The control displays exact state
and version; partners never receive the open-conflict list or hidden side IDs.

## Manual proposal and chat sharing

Provide typed forms for the record kinds in the data model, with clear required
fields and evidence links. Save creates a Pending revision and keeps the current
accepted value visible. A correction compares proposed and accepted values and
retains the request key through ambiguous failures. Do not imply review occurred.
Keyed kinds revise the existing customer/workload/product/maturity slot; list kinds
allow multiple items. Show an explicit confirmation when accepting a maturity
window older than the current one. Retraction shows Unknown rather than restoring
a prior value. Quality fields expose proposed R/D/C, rationales, information type
and retained date basis, with unknown defaults and server-computed F/Q.

A chat message action lets its owner explicitly select/edit the claim to submit to
that conversation's customer. Preview the exact shared text and scope before the
submission action. Explain that the claim becomes profile review material while
other chat messages stay private. Turi may also save a requested proposal via its
bounded tool and must return the same Pending receipt presentation.

Partners can see their own pending/rejected claims and safe reasons plus current
accepted delivery facts from all contributors. They have no queue or action that
reveals other contributors' unaccepted material. Internal-only staffing, utilization,
reporting metrics, costs and personnel data never reach their page payload.

## Steward review

`/customers/{customerId}/review` is available only to current stewards/admins.
Each candidate shows exact version, old accepted value, changed fields, source and
age, quality components, audience, conflicts, author and history. Accept/reject
requires a rationale; provide a partner-safe reason when the submitter is a partner.
Internal review notes are a separate field. Self-review is visibly attributed.

A candidate's requested audience is explicit. If the reviewer changes a factual
payload, audience or quality inputs, save a new candidate and review that exact version. No hidden
save-and-accept of modified text under the original ID. A record category that is
internal operational data cannot be made partner-visible.

Contributors can request retraction; only a steward/admin sees the execution action.
The action identifies the exact accepted version and explains that future guidance
will stop using it. A pending correction/request does not withdraw accepted context.
On 409, retain the unsaved form, show the conflict and require review of current
values before another decision. Never silently replay against a newer version.

## History and context changes

Show approved history to internal authorized users with lifecycle dates and clear
historical labels. Partner views follow the narrower current/own-submission policy.
Source access may show a restricted-source attestation without opening private
lineage. Do not use counts or disabled labels that reveal hidden records.

When trusted context changes, the chat shows “Customer context has changed. Start a
new conversation to use current information.” Keep a direct same-customer action;
no automatic new model call. Stored stale generated responses are withheld on
subsequent reads, with a clear historical notice. Owner messages remain available
under current customer access. Apply the same notice to time-only expiry (at the
next freshness boundary or 24-hour cap) and unbound 002 conversations. Hide stale
generated titles/snippets too; never copy a summary into the fresh conversation.
Revoked access clears protected content and uses
the existing generic unavailable/denied experience.

## States and accessibility acceptance

Exercise loading, sparse/empty, unavailable source, database failure, permission
loss, pending, rejected, stale source, conflict and outdated-version states. A failed
read must not look like an empty customer or claim a save succeeded. Bound long
text and source titles without clipping essential controls.

Validate all primary read/propose/review flows at 390×844 and 1440×900, light/dark,
using CLI Playwright/WebKit. Require visible keyboard focus, accessible labels,
logical headings, live save/error status, focus return after dialogs and no page
horizontal overflow. Tables may use an explicitly labeled local scroll region on
mobile. Run axe with zero serious/critical findings in the changed views. Capture
only synthetic screenshots; no host browser interaction.
