"use client";
import { useEffect,useState } from 'react';
import type { ExpansionSource } from '../../../lib/server/expansion/schema';
import type { inspectExpansionEvidence } from '../../../lib/server/expansion/evidence-detail';
type Detail=Awaited<ReturnType<typeof inspectExpansionEvidence>>;
export function ExpansionCitation({customerId,workloadId,source,recordId,revisionId,onClose}:{customerId:string;workloadId:string|null;source:ExpansionSource;recordId?:string;revisionId?:string;onClose:()=>void}){
 const[detail,setDetail]=useState<Detail|null>(null),[status,setStatus]=useState('Loading current original evidence…');
 useEffect(()=>{
  const controller=new AbortController(),params=new URLSearchParams();if(workloadId)params.set('workloadId',workloadId);
  if('citationId' in source&&source.citationId)params.set('citationId',source.citationId);
  else if(recordId&&revisionId){params.set('recordId',recordId);params.set('revisionId',revisionId);params.set('sourceKey',source.id);}
  else{setDetail(null);setStatus('Search again to obtain a current source citation.');return;}
  setDetail(null);setStatus('Loading current original evidence…');void fetch(`/api/expansion/customers/${customerId}/evidence/detail?${params}`,{cache:'no-store',signal:controller.signal}).then(async response=>{
   const body=await response.json() as {data?:Detail;error?:{message:string}};if(!response.ok||!body.data)throw Error('Evidence changed or is unavailable. Refresh its original source.');
   setDetail(body.data);setStatus('');
  }).catch(error=>{if(error.name!=='AbortError')setStatus(error.message);});return()=>controller.abort();
 },[customerId,workloadId,source,recordId,revisionId]);
 return <section className="profile-card" aria-labelledby="expansion-source-heading"><h2 id="expansion-source-heading">Source Detail</h2><button type="button" className="secondary-button" onClick={onClose}>Close Source</button>
  {status&&<p role="status">{status}</p>}{detail&&<><h3>{detail.title}</h3><blockquote>{detail.passage}</blockquote>
   {'canonicalUrl' in detail.locator&&/^https?:\/\//i.test(detail.locator.canonicalUrl)&&<p><a href={detail.locator.canonicalUrl} target="_blank" rel="noopener noreferrer">Open Original Public Source</a></p>}
   {'fieldPath' in detail.locator&&<p>Original Field: {detail.locator.fieldPath}</p>}
   <p>Classification: {detail.sourceKind==='verified_research'?'Attributed public research':detail.sourceKind==='shared_knowledge'?'Published shared practice':'Accepted customer evidence'}</p>
   <p>Observation Date: {detail.observationAt??'Unknown'}</p><p>Publication Date: {detail.publicationAt??'Unknown'}</p><p>Retrieval Date: {detail.retrievalAt??'Not applicable'}</p>
   {detail.quality&&<><p>Rubric: {detail.quality.rubricVersion}</p><p>Quality: {detail.quality.band} · Freshness: {detail.quality.freshness}</p><p>Reliability {detail.quality.R}/4 · Freshness {detail.quality.F}/4 · Directness {detail.quality.D}/4 · Corroboration {detail.quality.C}/4</p><p>Quality Valid Until: {detail.quality.validUntil}</p></>}
  </>}
 </section>;
}
