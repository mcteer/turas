# Product artifact templates

These are **v1 content contracts**, not generated customer deliverables.
Feature 006 implements the delivery-plan contract and merged in PR 11; hosted
acceptance remains separate. Feature 009 implements the weekly and executive
contracts with deterministic composition, selectable PDF and editable native
slide text/tables/charts; see its [reporting design and tasks](../../specs/009-weekly-executive-reporting/plan.md)
and [actual-output validation](../../specs/009-weekly-executive-reporting/validation.md).
LibreOffice evidence does not certify PowerPoint portability or hosted delivery. Feature 012 owns
product-gap reports. Each generator must validate required sections
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
