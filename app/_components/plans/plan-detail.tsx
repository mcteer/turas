"use client";

import { titleCaseLabel } from "../title-case-label";

import Link from "next/link";
import { useEffect,useState } from "react";
import type { PlanDraftContent } from "../../../lib/contracts/plan-content";
import { PlanDiagram } from "./plan-diagram";
import { PlanDiff } from "./plan-diff";
import { PlanEditor } from "./plan-editor";
import { PlanHistory } from "./plan-history";
import { PlanReview } from "./plan-review";
import { PlanDrafting } from "./plan-drafting";

type Detail={planId:string;revisionId:string;revisionNumber:number;title:string;
  contentDigest:string;changeReason:string|null;
  reviewState:string;contentAvailability:string;reviewRequired:boolean;
  content:PlanDraftContent|null;audience:string;acceptedRevisionId:string|null;
  engagementId:string|null;aggregateVersion:number;canRevise:boolean;canReview:boolean;
  workloadId:string|null};
type Envelope={data?:Detail;error?:{message:string}};

export function PlanDetail({customerId,planId}:{customerId:string;planId:string}) {
  const [detail,setDetail]=useState<Detail|null>(null);
  const [selected,setSelected]=useState<string|null>(null);
  const [editing,setEditing]=useState(false);
  const [drafting,setDrafting]=useState(false);
  const [message,setMessage]=useState("");
  const [reload,setReload]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();
    const url=new URL(`/api/plans/${planId}`,window.location.origin);
    if (selected) url.searchParams.set("revisionId",selected);
    void (async()=>{
      for(let attempt=0;attempt<2;attempt += 1){
        const response=await fetch(url,{cache:"no-store",signal:controller.signal});
        if(response.status===503 && attempt===0){
          await new Promise((resolve)=>setTimeout(resolve,500));
          continue;
        }
        const body=await response.json() as Envelope;
        if (!response.ok || !body.data) throw new Error(body.error?.message ?? "Plan unavailable");
        setDetail(body.data);setMessage("");
        return;
      }
    })().catch((error:unknown)=>{
      if (error instanceof DOMException && error.name==="AbortError") return;
      setMessage(error instanceof Error ? error.message:"Plan unavailable");
    });
    return ()=>controller.abort();
  },[planId,selected,reload]);
  const content=detail && ["readable","historical_warning"].includes(detail.contentAvailability)
    ? detail.content:null;
  return <main className="profile-page">
    <nav aria-label="Breadcrumb" className="profile-breadcrumb"><Link href="/customers">Customers</Link>
      <span aria-hidden="true">/</span><Link href={`/customers/${customerId}`}>Profile</Link>
      <span aria-hidden="true">/</span><Link href={`/customers/${customerId}/plans`}>Plans</Link></nav>
    {message && <p role="alert">{message}</p>}
    {!detail && !message && <p role="status">Loading plan…</p>}
    {detail && <>
      <header className="profile-header"><div><p className="profile-eyebrow">Delivery Plan · Revision {detail.revisionNumber}</p>
        <h1>{["readable", "historical_warning"].includes(detail.contentAvailability) ? detail.title : "Review Required"}</h1><p className="muted">{detail.audience} · {detail.reviewState.replaceAll("_"," ")}</p>
        {detail.changeReason && <p>Change reason: {detail.changeReason}</p>}
      </div><div className="profile-header-actions">
        {detail.engagementId && <Link className="secondary-button"
          href={`/customers/${customerId}/engagements/${detail.engagementId}`}>Accepted Engagement</Link>}
        {content && detail.canRevise && !selected &&
          <button type="button" className="secondary-button" onClick={()=>setEditing((v)=>!v)}>
            {editing ? "Close editor":"Revise plan"}</button>}
        {content && detail.canRevise && !selected &&
          <button type="button" className="secondary-button"
            onClick={()=>setDrafting((value)=>!value)}>
            {drafting ? "Close Turi draft":"Draft with Turi"}</button>}
      </div></header>
      {detail.contentAvailability==="historical_warning" && <p role="status" className="profile-caution">
        Evidence dates need review before current use.</p>}
      {!["readable","historical_warning"].includes(detail.contentAvailability) && <section className="profile-state" role="status">
        <h2>Review Required</h2><p>This revision is {detail.contentAvailability}. Its text and design are unavailable.</p>
      </section>}
      {editing && !selected && <PlanEditor customerId={customerId} planId={planId}
        onSaved={()=>{setEditing(false);setReload((value)=>value+1);}}/>}
      {drafting && detail && !selected && <PlanDrafting customerId={customerId}
        head={{planId,revisionId:detail.revisionId,
          aggregateVersion:detail.aggregateVersion,audience:detail.audience,
          workloadId:detail.workloadId}}
        onSaved={()=>setReload((value)=>value+1)}/>}
      {content && <>
        {detail.acceptedRevisionId && detail.acceptedRevisionId!==detail.revisionId &&
          <PlanDiff planId={planId} baseRevisionId={detail.acceptedRevisionId}
            targetRevisionId={detail.revisionId}/>}
        <section className="profile-section"><h2>Plan Sections</h2>
          {content.sections.filter((section)=>!["evidence","decision"].includes(section.key))
            .map((section)=><article className="profile-card" key={section.key}>
            <h3>{titleCaseLabel(section.key)}</h3>
            {section.state==="content" ? <p>{section.narrative}</p>:
              <p>{section.state.replaceAll("_"," ")} · {section.ownerRole ?? section.reason}</p>}
          </article>)}</section>
        <section className="profile-section"><h2>Evidence</h2>
          {content.assertions.length===0 && <p className="muted">No factual assertions recorded.</p>}
          {content.assertions.map((assertion)=><article className="profile-card" key={assertion.key}>
            <h3>{titleCaseLabel(assertion.kind)}</h3><p>{assertion.text}</p>
            {assertion.decisionCritical && <p className="profile-caution">Decision critical</p>}
            {assertion.sourceDependencyIds.map((id)=><p key={id}><a target="_blank" rel="noreferrer"
              href={`/api/plans/${planId}/revisions/${detail.revisionId}/sources/${id}`}>
                Exact source {id}</a></p>)}
          </article>)}</section>
        <section className="profile-section"><h2>Technical Design</h2>
          {content.diagrams.map((diagram)=><PlanDiagram key={diagram.key} diagram={diagram}/>)}
          {content.designDecisions.map((decision)=><article className="profile-card" key={decision.key}>
            <h3>{decision.title}</h3><p>{decision.chosen}</p>
            <p>Alternative: {decision.alternatives}</p><p>Rollback: {decision.rollback}</p>
          </article>)}</section>
        <section className="profile-section"><h2>Work and Milestones</h2>
          {content.workPackages.map((item)=><article className="profile-card" key={item.key}>
            <h3>{item.title}</h3><p>{item.track} · {item.ownerRole}</p><p>{item.exitEvidence}</p>
          </article>)}
          {content.milestones.map((item)=><article className="profile-card" key={item.key}>
            <h3>{item.title}</h3><p>{item.track} · {item.plannedDate ?? item.plannedDateUnknownReason}</p>
            <p>Exit evidence: {item.exitEvidence}</p><p>Customer validation: {item.customerValidation}</p>
          </article>)}</section>
      </>}
      {content && detail.canReview && detail.reviewState==="in_review" && !selected &&
        <PlanReview detail={{planId,revisionId:detail.revisionId,
          contentDigest:detail.contentDigest,aggregateVersion:detail.aggregateVersion,
          audience:detail.audience}} onDecided={()=>setReload((value)=>value+1)}/>}
      <PlanHistory planId={planId} onSelect={(revisionId)=>{
        setSelected(revisionId);setEditing(false);}}/>
      {selected && <button type="button" className="secondary-button"
        onClick={()=>setSelected(null)}>Current revision</button>}
    </>}
  </main>;
}
