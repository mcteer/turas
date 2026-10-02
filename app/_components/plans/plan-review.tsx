"use client";

import { titleCaseLabel } from "../title-case-label";

import { useEffect,useState } from "react";
import type { PlanDraftContent } from "../../../lib/contracts/plan-content";
import { PlanDiagram } from "./plan-diagram";
type Detail={planId:string;revisionId:string;contentDigest:string;
  aggregateVersion:number;audience:string};
type Preview={previewId:string;expiresAt:string;revisionId:string;
  contentDigest:string;sourceStateDigest:string;
  readiness:{ready:boolean;issues:{code:string;path:string}[]};content:PlanDraftContent};
type Envelope<T>={data?:T;error?:{message:string}};

export function PlanReview({detail,onDecided}:{detail:Detail;onDecided:()=>void}) {
  const [csrf,setCsrf]=useState("");
  const [preview,setPreview]=useState<Preview|null>(null);
  const [rationale,setRationale]=useState("");
  const [suitable,setSuitable]=useState(false);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  useEffect(()=>{
    void fetch("/api/auth/session",{cache:"no-store"}).then((r)=>r.json())
      .then((body:Envelope<{csrfToken:string}>)=>setCsrf(body.data?.csrfToken ?? ""));
  },[]);
  async function post<T>(path:string,body:unknown):Promise<T> {
    const response=await fetch(path,{method:"POST",headers:{"content-type":"application/json",
      "x-csrf-token":csrf},body:JSON.stringify(body)});
    const envelope=await response.json() as Envelope<T>;
    if (!response.ok || !envelope.data) throw new Error(envelope.error?.message ?? "Review unavailable");
    return envelope.data;
  }
  async function inspect() {
    setBusy(true);setMessage("");setPreview(null);
    try {
      const result=await post<Preview>(`/api/plans/${detail.planId}/review-preview`,{
        requestKey:crypto.randomUUID(),revisionId:detail.revisionId,
        contentDigest:detail.contentDigest,
        expectedAggregateVersion:detail.aggregateVersion});
      setPreview(result);
    } catch(error) {setMessage(error instanceof Error ? error.message:"Review unavailable");}
    finally {setBusy(false);}
  }
  async function decide(action:"accept"|"request_changes"|"reject") {
    if (!preview) return;
    setBusy(true);setMessage("");
    try {
      await post(`/api/plans/${detail.planId}/decisions`,{
        action,requestKey:crypto.randomUUID(),revisionId:preview.revisionId,
        contentDigest:preview.contentDigest,
        expectedAggregateVersion:detail.aggregateVersion,
        reviewPreviewId:preview.previewId,rationale,
        ...(action==="accept" ? {deliverySuitabilityConfirmed:suitable}:{}),
      });
      setPreview(null);setMessage("Decision recorded");onDecided();
    } catch(error) {
      setPreview(null);
      setMessage(error instanceof Error ? error.message:"Decision unavailable");
    }
    finally {setBusy(false);}
  }
  return <section className="profile-section" aria-label="Exact plan review">
    <h2>Human Review</h2><p>Review this exact revision and its current source state before deciding.</p>
    {message && <p role="status" className="profile-note">{message}</p>}
    {!preview && <button type="button" className="secondary-button" disabled={busy || !csrf}
      onClick={()=>void inspect()}>Inspect exact revision</button>}
    {preview && <div className="profile-card"><p>Revision {preview.revisionId}</p>
      <p className="muted">Content digest <code>{preview.contentDigest}</code></p>
      <p>Preview expires {new Date(preview.expiresAt).toLocaleString()}</p>
      <div className="profile-section" aria-label="Exact revision content">
        <h3>{preview.content.title}</h3>
        {preview.content.sections.map((section)=><section key={section.key}>
          <h4>{titleCaseLabel(section.key)}</h4>
          <p>{section.state==="content" ? section.narrative :
            `${section.state.replaceAll("_"," ")}: ${section.discoveryAction ?? section.reason ?? "Review required"}`}</p>
        </section>)}
        <h4>Assertions And Sources</h4>
        {preview.content.assertions.length===0 ? <p>No assertions recorded.</p>:
          <ul>{preview.content.assertions.map((assertion)=><li key={assertion.key}>
            {assertion.kind.replaceAll("_"," ")}: {assertion.text}
            {assertion.sourceDependencyIds.length>0 &&
              <span> · {assertion.sourceDependencyIds.length} source reference(s)</span>}
          </li>)}</ul>}
        <h4>Technical Design</h4>
        {preview.content.diagrams.map((diagram)=><PlanDiagram key={diagram.key} diagram={diagram}/>)}
        <ul>{preview.content.designDecisions.map((decision)=><li key={decision.key}>
          {decision.title}: {decision.chosen}. Alternative: {decision.alternatives}.
          Rollback: {decision.rollback}.
        </li>)}</ul>
        <h4>Planned Work And Exit Evidence</h4>
        <ul>{preview.content.workPackages.map((item)=><li key={item.key}>
          {item.track}: {item.title} · {item.exitEvidence}
        </li>)}</ul>
        <ul>{preview.content.milestones.map((item)=><li key={item.key}>
          Milestone {item.key}: {item.title} · {item.exitEvidence}
        </li>)}</ul>
        <h4>Complete Revision Fields</h4>
        <p className="muted">Includes dates, source identities, design checks, effort and
          milestone dependencies exactly as stored for this review.</p>
        <pre aria-label="Complete exact revision fields" style={{maxHeight:"24rem",
          overflow:"auto",whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>
          {JSON.stringify(preview.content,null,2)}
        </pre>
      </div>
      {preview.readiness.issues.length>0 && <div role="alert"><h3>Acceptance Blockers</h3>
        <ul>{preview.readiness.issues.map((issue,index)=><li key={`${issue.path}:${index}`}>
          {issue.path}: {issue.code.replaceAll("_"," ")}</li>)}</ul></div>}
      <label>Decision rationale<textarea className="field" value={rationale}
        onChange={(event)=>setRationale(event.target.value)} maxLength={2_000}/></label>
      {detail.audience==="delivery" && <label><input type="checkbox" checked={suitable}
        onChange={(event)=>setSuitable(event.target.checked)}/>
        I reviewed this exact content for delivery suitability</label>}
      <div className="plan-inline">
        <button type="button" disabled={busy || !preview.readiness.ready || !rationale.trim() ||
          (detail.audience==="delivery" && !suitable)} onClick={()=>void decide("accept")}>Accept baseline</button>
        <button type="button" className="secondary-button" disabled={busy || !rationale.trim()}
          onClick={()=>void decide("request_changes")}>Request changes</button>
        <button type="button" className="secondary-button" disabled={busy || !rationale.trim()}
          onClick={()=>void decide("reject")}>Reject</button>
      </div></div>}
  </section>;
}
