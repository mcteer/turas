"use client";

import Link from "next/link";
import { useEffect,useState } from "react";
type Engagement={engagementId:string;planId:string;acceptedRevisionId:string;
  baselineNumber:number;title:string;contentAvailability:string;reviewRequired:boolean;
  milestones:{key:string;title:string;track:string;exitEvidence:string;
    customerValidation:string;plannedDate:string|null;plannedDateUnknownReason?:string}[]|null;
  workPackages:{key:string;title:string;track:string;exitEvidence:string}[]|null;
  acceptedAt:string};
type Envelope={data?:Engagement;error?:{message:string}};

export function EngagementDetailView({customerId,engagementId}:{
  customerId:string;engagementId:string}) {
  const [detail,setDetail]=useState<Engagement|null>(null);
  const [message,setMessage]=useState("");
  useEffect(()=>{
    const controller=new AbortController();
    void fetch(`/api/engagements/${engagementId}`,{cache:"no-store",signal:controller.signal})
      .then(async(response)=>{
        const body=await response.json() as Envelope;
        if (!response.ok || !body.data) throw new Error(body.error?.message ?? "Engagement unavailable");
        setDetail(body.data);
      }).catch((error:unknown)=>{
        if (error instanceof DOMException && error.name==="AbortError") return;
        setMessage(error instanceof Error ? error.message:"Engagement unavailable");
      });
    return ()=>controller.abort();
  },[engagementId]);
  return <main className="profile-page"><nav aria-label="Breadcrumb" className="profile-breadcrumb">
    <Link href="/customers">Customers</Link><span aria-hidden="true">/</span>
    <Link href={`/customers/${customerId}`}>Profile</Link><span aria-hidden="true">/</span>
    <span>Engagement</span></nav>
    {message && <p role="alert">{message}</p>}
    {!detail && !message && <p role="status">Loading engagement…</p>}
    {detail && <><header className="profile-header"><div>
      <p className="profile-eyebrow">Accepted internal baseline {detail.baselineNumber}</p>
      <h1>{detail.title}</h1><p className="muted">Accepted {new Date(detail.acceptedAt).toLocaleString()}</p>
      </div><Link href={`/customers/${customerId}/plans/${detail.planId}`}>Source plan</Link>
      </header>
      {detail.contentAvailability==="historical_warning" && <p role="status" className="profile-caution">
        Evidence dates need review before current use.</p>}
      {!["readable","historical_warning"].includes(detail.contentAvailability) ? <section className="profile-state" role="status">
        <h2>Review required</h2><p>Source material changed. Baseline text is unavailable.</p>
      </section> : <><section className="profile-section"><h2>Planned work</h2>
        {detail.workPackages?.map((item)=><article className="profile-card" key={item.key}>
          <h3>{item.title}</h3><p>{item.track}</p><p>Exit evidence: {item.exitEvidence}</p>
        </article>)}</section><section className="profile-section"><h2>Planned milestones</h2>
        {detail.milestones?.map((item)=><article className="profile-card" key={item.key}>
          <h3>{item.title}</h3><p>{item.track} · {item.plannedDate ?? item.plannedDateUnknownReason}</p>
          <p>Exit evidence: {item.exitEvidence}</p>
          <p>Customer validation: {item.customerValidation}</p>
        </article>)}</section></>}
      <p className="muted">This is an internal delivery baseline. Customer approval and staffing are separate decisions.</p>
    </>}
  </main>;
}
