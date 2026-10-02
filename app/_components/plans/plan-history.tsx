"use client";

import { useEffect,useState } from "react";
type Revision={revisionId:string;revisionNumber:number;title:string;
  reviewState:string;contentAvailability:string;createdAt:string;
  changeReason:string|null};
type Envelope={data?:{items:Revision[];nextCursor:string|null};error?:{message:string}};

export function PlanHistory({planId,onSelect}:{planId:string;
  onSelect:(revisionId:string)=>void}) {
  const [items,setItems]=useState<Revision[]>([]);
  const [cursor,setCursor]=useState<string|null>(null);
  const [message,setMessage]=useState("");
  async function load(next:string|null) {
    try {
      const url=new URL(`/api/plans/${planId}/revisions`,window.location.origin);
      if (next) url.searchParams.set("cursor",next);
      let response=await fetch(url,{cache:"no-store"});
      if(response.status===503){
        await new Promise((resolve)=>setTimeout(resolve,500));
        response=await fetch(url,{cache:"no-store"});
      }
      const body=await response.json() as Envelope;
      if (!response.ok || !body.data) throw new Error(body.error?.message ?? "History unavailable");
      setItems((current)=>next ? [...current,...body.data!.items]:body.data!.items);
      setCursor(body.data.nextCursor);
      setMessage("");
    } catch(error) {setMessage(error instanceof Error ? error.message:"History unavailable");}
  }
  useEffect(()=>{void load(null);},[planId]);
  return <section className="profile-section"><h2>Revision History</h2>
    {message && <p role="alert">{message}</p>}
    {message && <button type="button" className="secondary-button"
      onClick={()=>void load(null)}>Retry history</button>}
    <ol>{items.map((item)=><li key={item.revisionId}>
      <button type="button" className="secondary-button" onClick={()=>onSelect(item.revisionId)}>
        Revision {item.revisionNumber}: {item.title}</button>
      <span className="muted"> {["readable","historical_warning"].includes(item.contentAvailability) ?
        item.reviewState.replaceAll("_"," "):"Review required"} · {new Date(item.createdAt).toLocaleString()}</span>
      {item.changeReason && <p>Change reason: {item.changeReason}</p>}
    </li>)}</ol>
    {cursor && <button type="button" className="secondary-button"
      onClick={()=>void load(cursor)}>Older revisions</button>}
  </section>;
}
