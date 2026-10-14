"use client";

import { profileSummary, researchProductMentions, type SummaryFact, type SummaryResearch } from "../../../lib/profiles/summary";
import { UiIcon } from "../ui-icon";

type Delivery = { state: "ready" | "review_required" | "unavailable"; activeCount: number | null };
export function CustomerSummary({ facts, research, description, workloadId, delivery, onSource }: {
  facts: SummaryFact[]; research: SummaryResearch[]; description?: string;
  workloadId: string | null; delivery?: Delivery; onSource: (sourceId: string) => void;
}) {
  const summary = profileSummary(facts, workloadId), documented = researchProductMentions(research);
  const knownNames = new Set(summary.products.map(product => product.name.toLowerCase()));
  const researchedProducts = documented.filter(product => !knownNames.has(product.name.toLowerCase()));
  const business = summary.description || description;
  return <section className="customer-summary" aria-labelledby="customer-overview-heading">
    <div className="customer-summary-heading"><h2 id="customer-overview-heading">Customer Overview</h2>
      </div>
    {business && <p className="customer-business-summary">{business}</p>}
    <dl className="customer-summary-metrics">
      <div><dt><UiIcon name="customers" size={16} />Maturity</dt>
        <dd><span>{summary.maturity?.stage ?? "Unknown"}</span>
        {summary.maturity?.stageNumber ? <>
          <div className="maturity-stage-track" role="img" aria-label={`Maturity stage ${summary.maturity.stageNumber} of 6`}>
            {Array.from({ length: 6 }, (_, index) => <span key={index} data-reached={index < summary.maturity!.stageNumber!} />)}
          </div><p>Stage {summary.maturity.stageNumber} of 6{summary.maturity.reviewDue ? " · Review due" : ""}</p>
        </> : <p>No evidenced maturity stage recorded</p>}</dd>
      </div>
      <div><dt><UiIcon name="access" size={16} />Risk Level</dt>
        <dd className="customer-risk" data-level={summary.risk?.level}><span>{summary.risk ? summary.risk.level[0].toUpperCase() + summary.risk.level.slice(1) : "Unknown"}</span>
        <p>{summary.risk ? `${summary.risk.count} open or accepted risk${summary.risk.count === 1 ? "" : "s"}${summary.risk.reviewDue ? " · Review due" : ""}` : "No current risk assessment recorded"}</p></dd>
      </div>
      <div><dt><UiIcon name="plan" size={16} />Active Delivery</dt>
        <dd><span>{delivery?.activeCount ? `${delivery.activeCount} Active` : delivery?.state === "ready" ? "None Recorded" : "Unknown"}</span>
        <p>{delivery?.state === "review_required" ? "Engagement evidence needs review" : delivery?.state === "ready" ? "Based on current delivery records" : "Current delivery status is unavailable"}</p></dd>
      </div>
    </dl>
    <div className="customer-product-footprint"><div><h3>Products</h3><p className="muted">Known products from customer records and research</p></div>
      {summary.products.length + researchedProducts.length === 0 ? <p className="muted">The available evidence does not yet identify specific products in use.</p> : <ul className="customer-product-list">
        {summary.products.map(product => <li key={product.key}><span className="customer-product-chip">{product.name}</span><span className="muted">Reviewed use</span></li>)}
        {researchedProducts.map(product => <li key={product.name}><button type="button" className="customer-product-chip" onClick={() => onSource(product.sources[0].sourceRevisionId)}>{product.name}<UiIcon name="arrow" size={13} /></button><span className="muted">Researched · View source</span></li>)}
      </ul>}
    </div>
  </section>;
}
