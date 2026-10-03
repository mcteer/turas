# Report Content and Artifact Contract

**Versions**: `reports-v1`, `report-projection-v1`, `report-metrics-v1`,
`weekly-status-v1`, `executive-review-v1`. Template/brand/render versions participate
in the revision identity. New versions never silently rewrite publications.

## Structured Document

`ReportDocument` has scoped identity, title, kind, timezone, period, server capture
time, partial flag, audience/classification, owner/sponsor labels or unknown reasons,
sections, metrics, public-safe citation labels, gaps, annotations and correction
predecessor. Every factual block binds exact accepted source/decision references.
Restricted dependency IDs remain server-side; external footers use opaque citation
labels and source descriptions safe for that audience. No claim contains arbitrary
HTML, scripts, template instructions, external images or executable formulas.

Use fixed templates plus eligible source text and explicitly labeled proposals/
questions. The author may choose emphasis or order within a required section, but
may not replace a metric with free text, add an unsupported fact or relabel a
proposal as accepted. A changed source-bound claim is a new revision. New facts
must first pass the original source approval workflow.

### Weekly Sections

1. Executive Summary: evidence-backed delivery state and requested decision;
   neutral unknown when no validated update exists.
2. Completed and Accepted: dated activity separately from accepted milestones.
3. Next Week: reviewed planned actions, accountable owner/due date or explicit unknown.
4. Milestones and Scope: exact baseline, forecast and material changes.
5. Risks, Issues and Decisions: reviewed concerns, impact, owner and mitigation.
6. Effort and Capacity: permitted approved aggregate actual/plan/remaining values;
   capacity constraints only when explicitly delivery-visible, no utilization/personnel data.
7. Customer Actions and Outcomes: reviewed measurement basis, decisions and handoff gaps.
8. Source and Review Footer: period/cutoff, safe source labels, late/missing coverage,
   template/report versions and review identity safe for the audience.

### Executive Sections

1. Executive Decision Brief.
2. Maturity Journey: scoped ordinal dimensions, dated evidence, no combined score.
3. Value and Adoption: measured baseline/current/target and limitations.
4. Delivery Portfolio: selected customer's engagements only.
5. Risk and Readiness: reviewed delivery/handoff evidence; support automation unavailable.
6. Next-period Plan: reviewed planned activities and explicit decisions; qualified
   expansion unavailable until a later feature supplies authorized records.
7. Appendix: eligible evidence, formulas, detailed milestones and omission reasons.

All six narrative sections remain present. Optional appendix subsections may be
omitted with a reason. Missing or unavailable data is not zero and not success.
Standalone PDF must be understandable without the slide deck or application login.
External citation labels are descriptive; restricted in-app links are omitted from
external files/email, so a customer is never sent a nonfunctional source-login link.
Public URLs require an approved scheme/host and no credentials/query secrets.

## Period and Snapshot Rules

- User chooses one canonical week/month/quarter and timezone. Monday–Sunday weeks
  and calendar months/quarters have local-date boundaries; elapsed hours vary at DST.
- Use Temporal date arithmetic, not fixed-millisecond subtraction. Current periods
  require partial=true; stop actuals at capture date/time and label the partial window.
- Executive workload selection uses accepted same-customer workload IDs; selected
  engagements must match them, with explicit customer-level inclusion for unassigned
  engagements. Show “No workload assigned” instead of inventing a workload.
- Capture current accepted heads and exact decisions in a consistent transaction
  using its server capture instant. Recheck their current eligibility before release.
- A past period regenerated today includes currently approved late entries, with a
  new cutoff and correction label when replacing a publication. Do not pretend to
  reconstruct the state known on an old arbitrary date.
- Source-set overflow blocks the report. SQL limits must request limit+1 and signal
  overflow; no first-N subset becomes a apparently complete report.
- Select record event/service dates in period, plus current open RAID, relevant
  milestone/baseline/forecast/handoff/outcome and next-period commitments explicitly
  needed for the narrative. Record a coverage manifest for the selected audience.
  Do not disclose hidden record/source counts or resource identities.

## Calculation Rules

`report-metrics-v1` uses integer minutes/decimal strings with BigInt arithmetic.
Display hours with two decimals using half-up rounding only at final presentation;
retain exact minutes in the restricted calculation receipt.

| Metric | Rule |
| --- | --- |
| Period actual | Sum each eligible approved time-entry revision's contribution once where service date falls in selected period; corrections replace predecessor only after approval; reversed entries contribute zero |
| Cumulative actual | Sum permitted approved contributions through the capture cutoff, independently of period actual; clearly label since engagement start |
| Remaining | One current reviewed estimate per selected work package, or unknown; do not carry a superseded estimate silently |
| Forecast | Cumulative actual + current remaining, once per engagement; never sum monthly forecasts |
| Variance | Forecast − reviewed effort budget, only when both cover the same scope and units |
| Planned effort | Confirmed allocation/budget quantities only where their aggregate is authorized; label plan and period separately from actual |
| Customer outcome | Use reviewed numeric outcome fields, unit, observation window and baseline/target; do not parse narrative text into numbers |
| Comparable change | Current − baseline only for the same measure/unit/scope/method; percentage only for nonzero comparable baseline, with denominator shown |
| Missing denominator/budget | unknown; genuine zero denominator is not applicable; neither is displayed as zero percent |
| Maturity | Keep scoped dimension labels and evidence windows; no arithmetic or overall average |

Do not include individual utilization, capacity calendars, personnel evidence,
internal rates, revenue/margins or mixed-currency economic charts. The 008 authorized
engagement total is a permitted aggregate; use its exact disclosure rules and counted
revision identity. If a source/grant change prevents an eligible aggregate, withhold
it instead of leaking hidden inputs through a variance or denominator.

## Layout and Validation

- Approved immutable asset manifest: authentic logo bytes, static Geist fonts,
  licenses/provenance, restrained neutral palette and master/layout hashes.
- PDF: A4 portrait, body ≥10 pt, notes ≥8 pt, no clipped selectable text; semantic
  headings/table headers, tagged output, outline, explicit reading-order inspection.
- PPTX: 16:9 wide, body ≥18 pt, footnotes/chart labels ≥12 pt, titles ≥28 pt.
  Native text, tables and native chart objects with workbook data. No slide-sized
  raster substitute. Logo/illustration images do not count as editable chart data.
- Tables paginate with repeated headers; charts allow at most 12 categories and
  4 series. Longer content uses labeled continuation pages/slides within C07 bounds,
  or fails with a repairable reason. Never solve overflow by shrinking below minima.
- Render with installed approved fonts and fail on missing fonts/glyphs. PPTX
  recipients must have approved Geist installed; disclose and verify that environment.
- All formats share source-derived wording/values/units/citation labels and exact
  revision, but may use different layouts. Compare semantic parity, not ZIP hashes.
- Sanitize file/document metadata, filenames, links, hidden slides, notes, alt text,
  embedded workbook fields and image metadata. No internal sources/addresses/provider IDs.
- Validate every output page/slide: bounds, overlap, text extraction, section presence,
  labels, readable contrast, source references, reading order and safe links.
- Publication binds the final bytes and validation receipt. Regenerating even the
  same content produces a new render identity and cannot replace approved attachments.

Synthetic preview has a visible preview classification until its brand profile is
approved. Tests may approve a fixture profile only in their owned test environment;
that approval cannot satisfy a live environment's brand requirement.
