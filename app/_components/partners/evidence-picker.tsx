"use client";
import { useState } from "react";
import type { PartnerSource } from "../../../lib/contracts/partners";
import type { listPartnerEvidence } from "../../../lib/server/partners/sources";
import { usePartnerView } from "./revalidation";
export function PartnerEvidencePicker({customerId,engagementId,selected,onSelect,disabled=false,sourceType="originals",purpose="guide"}:{customerId:string;engagementId:string;selected:PartnerSource[];onSelect:(sources:PartnerSource[])=>void;disabled?:boolean;sourceType?:"originals"|"execution";purpose?:"guide"|"demonstration"}){
 const [search,setSearch]=useState(""),[cursor,setCursor]=useState<string|null>(null),query=new URLSearchParams({customerId,engagementId,sourceType,limit:"10",search,...(cursor?{cursor}:{})});
 const client=usePartnerView<Awaited<ReturnType<typeof listPartnerEvidence>>>(`/api/partners/evidence?${query}`);
 return <fieldset className="profile-card"><legend>{sourceType==="execution"?"Accepted Delivery Demonstrations":"Reviewed Evidence"}</legend><p>Choose current accepted customer evidence or sanitized shared practice. Research describes product behavior, rather than a customer demonstration.</p>
  <label>{sourceType==="execution"?"Search Accepted Delivery Records":"Search Reviewed Evidence"}<input className="field" maxLength={200} value={search} onChange={e=>{client.clear();setCursor(null);setSearch(e.target.value);}}/></label>{client.status&&<p role="status">{client.status}</p>}
  {client.view&&<>{client.view.items.map(({reference,text})=>{const checked=selected.some(r=>r.kind===reference.kind&&r.sourceRevisionId===reference.sourceRevisionId),q=reference.quality;return <label className="profile-card partner-evidence-option" key={reference.id}><input type="checkbox" checked={checked} disabled={disabled||!checked&&selected.length>=20} onChange={event=>onSelect(event.target.checked?[...selected,reference]:selected.filter(r=>r.kind!==reference.kind||r.sourceRevisionId!==reference.sourceRevisionId))}/><span>{text}</span><p>{reference.kind.replaceAll("_"," ")} · Quality {q.Q}/100 · {q.freshness} · Directness {q.D}/4</p><p>{q.rationale}</p><p>Assessed {q.asOf}; valid until {q.validUntil}</p></label>;})}
  {!client.view.items.length&&<p>No eligible evidence on this page. Refine the search or continue when another page is available.</p>}
  {cursor&&<button type="button" className="secondary-button" onClick={()=>{client.clear();setCursor(null);}}>First Evidence Page</button>}{client.view.nextCursor&&<button type="button" className="secondary-button" onClick={()=>{client.clear();setCursor(client.view!.nextCursor);}}>More Evidence</button>}</>}
  <p>{selected.length} selected sources. {purpose==="guide"?"Each lesson and checkpoint must identify its supporting sources.":"Select separately accepted evidence of this demonstration. General research alone cannot verify it."}</p>
 </fieldset>;
}
