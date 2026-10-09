"use client";
import { useState, type FormEvent } from "react";
import type { ExpansionSource } from "../../../lib/server/expansion/schema";
import { ExpansionStructuredFields,type ExpansionStructuredValue } from "./structured-fields";
import { expansionHypothesisSchema, type ExpansionHypothesis } from "../../../lib/contracts/expansion";
export function ExpansionEditor({ initial, sources, owners, busy, onSave, onCancel, existingRecord=false }: {
  initial?: ExpansionHypothesis; existingRecord?:boolean; sources: ExpansionSource[]; owners:{id:string;name:string}[]; busy: boolean; onSave: (content: ExpansionHypothesis) => Promise<void>; onCancel: () => void;
}) {
  const [error, setError] = useState("");
  const [details,setDetails]=useState<ExpansionStructuredValue>({currentUse:initial?.currentUse??{kind:'unknown',reason:'Actual use has not been established.'},
    benefit:initial?.benefit??{kind:'unknown',reason:'Benefit requires customer validation.'},assertions:initial?.assertions??[],unknowns:initial?.unknowns??[],
    prerequisites:initial?.prerequisites??[],constraints:initial?.constraints??[],alternatives:initial?.alternatives??[{kind:'retain_current_practice',title:'Retain current practice',rationale:'Continue current practice while validating the need.'}]});
  const fields = ["Hypothesis Title", "Product Key", "Product Label", "Problem Key", "Problem", "Customer Benefit", "Proposed Engagement", "Next Action", "Validation Criterion"] as const;
  const values = [initial?.title, initial?.productKey, initial?.productLabel, initial?.problemKey, initial?.problem,
    initial?.customerBenefit, initial?.proposedEngagement, initial?.nextStep.action, initial?.nextStep.validationCriterion];
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget), text = (key: string) => String(data.get(key) ?? "");
    const content = { ...(initial ?? {}), contractVersion: "expansion-v1", title: text(fields[0]), productKey: text(fields[1]),
      productLabel: text(fields[2]), problemKey: text(fields[3]), problem: text(fields[4]), customerBenefit: text(fields[5]),
      proposedEngagement: text(fields[6]), intent: text("Intent"), currentUse: details.currentUse, benefit: details.benefit, assertions: details.assertions,
      unknowns: details.unknowns, prerequisites: details.prerequisites, constraints: details.constraints,
      alternatives: [{ kind: "retain_current_practice", title: "Retain current practice", rationale: text("Retain Current Practice Rationale") },...details.alternatives.filter(a=>a.kind==='other')],
      productVersion:text('Product Version')||undefined,
      nextStep: { action: text(fields[7]), validationCriterion: text(fields[8]), owner: text("Responsible Owner") ? {kind:"membership",membershipId:text("Responsible Owner")} : { kind: "unknown", reason: text("Responsible Owner Unknown Reason") } },
      nextReviewDate: text("Next Review Date") };
    const parsed = expansionHypothesisSchema.safeParse(content);
    if (!parsed.success) { setError(parsed.error.issues.map(issue => `${issue.path.join(" ")}: ${issue.message}`).join("; ")); return; }
    setError(""); try { await onSave(parsed.data); } catch (failure) { setError(failure instanceof Error ? failure.message : "Save unavailable"); }
  }
  return <form onSubmit={submit} className="profile-card"><fieldset disabled={busy}><h2>{initial ? "Edit Hypothesis" : existingRecord ? "Fresh Working Revision" : "New Hypothesis"}</h2>
    {existingRecord&&!initial&&<p>Original content is unavailable. Enter the original product and problem keys to save a fresh revision. Identity changes require a new related hypothesis.</p>}
    <p>Record a discovery proposal. Unknown use, benefit, and ownership remain explicit until supported by evidence.</p>
    {fields.map((label, index) => <label key={label} htmlFor={`expansion-field-${index}`}>{label}
      <input id={`expansion-field-${index}`} name={label} className="field" required maxLength={index < 4 ? (index === 1 ? 80 : index === 3 ? 120 : 200) : 2000}
        defaultValue={values[index]} readOnly={!!initial && (index === 1 || index === 3)} /></label>)}
    <label htmlFor="expansion-version">Product Version (Optional)</label><input id="expansion-version" name="Product Version" className="field" maxLength={100} defaultValue={initial?.productVersion}/>
    <label htmlFor="expansion-intent">Intent</label><select id="expansion-intent" className="field" name="Intent" defaultValue={initial?.intent ?? "new_product"}>
      <option value="new_product">New Product</option><option value="usage_expansion">Usage Expansion</option></select>
    {([['Responsible Owner Unknown Reason', 'Responsible owner has not been established.'], ['Retain Current Practice Rationale', 'Continue current practice while validating the need.']] as const).map(([label, value], index) =>
      <label key={label} htmlFor={`expansion-reason-${index}`}>{label}<textarea id={`expansion-reason-${index}`} className="field" name={label} required maxLength={2000}
        defaultValue={label === 'Retain Current Practice Rationale' ? initial?.alternatives.find(a => a.kind === 'retain_current_practice')?.rationale ?? value : initial?.nextStep.owner.kind==='unknown'?initial.nextStep.owner.reason:value} /></label>)}
    <ExpansionStructuredFields value={details} onChange={setDetails} sources={sources} owners={owners}/>
    <label htmlFor="expansion-responsible">Responsible Owner</label><select id="expansion-responsible" name="Responsible Owner" className="field" defaultValue={initial?.nextStep.owner.kind==='membership'?initial.nextStep.owner.membershipId:''}>
      <option value="">Unknown</option>{owners.map(owner=><option value={owner.id} key={owner.id}>{owner.name}</option>)}</select>
    <label htmlFor="expansion-date">Next Review Date<input id="expansion-date" type="date" name="Next Review Date" className="field" required
      defaultValue={initial?.nextReviewDate ?? new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)} /></label>
    {error && <p role="alert">{error}</p>}<div className="profile-header-actions"><button disabled={busy} type="submit" className="primary-button">Save as Proposed</button>
      <button disabled={busy} type="button" className="secondary-button" onClick={onCancel}>Cancel</button></div>
  </fieldset></form>;
}
