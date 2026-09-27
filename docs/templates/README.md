# Product artifact templates

These are proposed **v1 content contracts**, not generated customer deliverables.
Feature 006 implements delivery-plan validation; 009 implements report renderers;
012 implements product-gap reports. Each generator must validate required sections
and source lineage before review. Missing inputs stay explicitly unknown.

| Template | Purpose |
| --- | --- |
| [Delivery plan](delivery-plan.md) | Accepted engagement baseline plus technical design |
| [Weekly status](weekly-status.md) | Delivery-log rollup for a defined audience/week |
| [Executive report](executive-report.md) | Monthly/quarterly PDF and editable QBR slides |
| [Detailed product gap](product-gap-detail.md) | Evidence for one engineering/product decision |
| [Product gap summary](product-gap-summary.md) | Portfolio gap priorities and unique customer impact |

All artifacts carry ID, schema/template version, customer/workspace scope, author,
generated-at and as-of times, period, audience/classification, source revision list,
review status and approver. Plans and reports retain immutable accepted/published
versions; changed input produces a new version. Redact for the intended audience.
“Not applicable” needs a reason; empty required sections are validation failures.
