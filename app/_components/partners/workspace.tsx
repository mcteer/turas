"use client";
import Link from "next/link";
import { useState } from "react";
import type { readPartnerWorkspace,readPartnerEngagements } from "../../../lib/server/partners/workspace";
import { usePartnerView } from "./revalidation";
import {PartnerAssignmentList} from "./learning";
import { PartnerGuideList } from "./guides";

export function PartnerWorkspace({customerId}:{customerId?:string}){
 const [search,setSearch]=useState(""),[cursor,setCursor]=useState<string|null>(null);
 const parameters=new URLSearchParams({limit:"20",search,...(cursor?{cursor}:{})});
 const customer=Boolean(customerId),endpoint=customerId?`/api/partners/customers/${customerId}/engagements?${parameters}`:`/api/partners/workspace?${parameters}`;
 const client=usePartnerView<Awaited<ReturnType<typeof readPartnerWorkspace>>|Awaited<ReturnType<typeof readPartnerEngagements>>>(endpoint),{view}=client;
 return <section className="profile-page">
  <header className="profile-header"><div><h1>{view&&"displayName" in view?view.displayName:"Partner Delivery"}</h1><p>{customer?"Accepted delivery plans and current customer work.":"Find your assigned customer delivery work and shared practices."}</p></div><button className="secondary-button" type="button" onClick={()=>void client.refresh()}>Refresh Delivery Work</button></header>
  <div className="gap-filters"><label>{customer?"Search Delivery Work":"Search Assigned Customers"}<input className="field" maxLength={200} value={search} onChange={event=>{client.clear();setCursor(null);setSearch(event.target.value);}}/></label></div>
  {client.status&&<p role="status">{client.status}</p>}
  {view&&<div data-testid="partner-protected-body">
   {!view.items.length&&<p>{customer?"No eligible delivery work on this page. Continue to the next page when available.":"No assigned customers match this search. Shared Knowledge remains available."}</p>}
   {view.items.map(item=>"engagementId" in item?<article className="profile-card" key={item.engagementId}><h2>{item.title}</h2><p>{item.reviewRequired?"Review required":"Current accepted baseline"} · Baseline {item.baselineNumber}</p><div className="gap-filters"><Link prefetch={false} href={item.links.plan}>Delivery Plan and Proposals</Link><Link prefetch={false} href={item.links.execution}>Delivery Execution</Link><Link prefetch={false} href={item.links.support}>Accepted Support</Link></div>{!item.reviewRequired&&<PartnerGuideList customerId={item.customerId} engagementId={item.engagementId} acceptedRevisionId={item.acceptedRevisionId} baselineId={item.baselineId}/>}</article>:<article className="profile-card" key={item.customerId}><h2><Link prefetch={false} href={item.href}>{item.displayName}</Link></h2><p>Assigned customer delivery work</p></article>)}
   <div className="gap-filters">{cursor&&<button className="secondary-button" type="button" onClick={()=>{client.clear();setCursor(null);}}>First Page</button>}{view.nextCursor&&<button className="secondary-button" type="button" onClick={()=>{client.clear();setCursor(view.nextCursor);}}>More {customer?"Delivery Work":"Customers"}</button>}</div>
  </div>}
  {customerId&&view&&<PartnerAssignmentList customerId={customerId}/>}
  <p><Link prefetch={false} href="/knowledge">Shared Knowledge</Link>{customer&&<> · <Link prefetch={false} href="/partners">Assigned Customers</Link></>}</p>
 </section>;
}
