"use client";

import Link from "next/link";
import { useEffect,useState } from "react";

type Plan={planId:string;title:string;revisionId:string;reviewState:string;
  contentAvailability:string;reviewRequired:boolean;workloadId:string|null;
  acceptedRevisionId:string|null};
type Envelope={data?:{items:Plan[];nextCursor:string|null};error?:{message:string}};

export function PlanList({customerId}:{customerId:string}) {
  const [items,setItems]=useState<Plan[]>([]);
  const [cursor,setCursor]=useState<string|null>(null);
  const [busy,setBusy]=useState(true);
  const [message,setMessage]=useState("");
  async function load(next:string|null) {
    setBusy(true);setMessage("");
    try {
      const url=new URL("/api/plans",window.location.origin);
      url.searchParams.set("customerId",customerId);
      if (next) url.searchParams.set("cursor",next);
      const response=await fetch(url,{cache:"no-store"});
      const envelope=await response.json() as Envelope;
      if (!response.ok || !envelope.data) throw new Error(envelope.error?.message ?? "Plans unavailable");
      setItems((current)=>next ? [...current,...envelope.data!.items]:envelope.data!.items);
      setCursor(envelope.data.nextCursor);
    } catch(error) {setMessage(error instanceof Error ? error.message:"Plans unavailable");}
    finally {setBusy(false);}
  }
  useEffect(()=>{void load(null);},[customerId]);
  return <section className="profile-section" aria-label="Delivery plans">
    <div className="profile-section-head"><h1>Delivery plans</h1>
      <Link className="secondary-button" href={`/customers/${customerId}/plans/new`}>New plan</Link></div>
    {message && <p role="alert">{message}</p>}
    {!busy && items.length===0 && <p className="muted">No plans in this customer scope.</p>}
    <div className="profile-grid">{items.map((item)=><article className="profile-card"
      key={item.planId}>
      <h2>{item.title}</h2><p>{["readable","historical_warning"].includes(item.contentAvailability) ?
        item.reviewState.replaceAll("_"," "):"Review required"}</p>
      {item.contentAvailability==="historical_warning" && <p className="profile-caution">
        Evidence dates need review</p>}
      <p className="muted">{item.workloadId ? "Workload plan":"Customer-wide plan"}</p>
      <Link href={`/customers/${customerId}/plans/${item.planId}`}>Open plan</Link>
    </article>)}</div>
    {busy && <p role="status">Loading plans…</p>}
    {cursor && !busy && <button type="button" className="secondary-button"
      onClick={()=>void load(cursor)}>Load more</button>}
  </section>;
}
