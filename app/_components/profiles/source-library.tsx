"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
import {z} from "zod";
import {EvidenceDetail} from "./evidence-detail";

const librarySchema=z.object({more:z.boolean(),sources:z.array(z.object({
  id:z.string(),sourceRevisionId:z.uuid().nullable(),url:z.url(),title:z.string(),publishedAt:z.iso.date().nullable(),
  checkedAt:z.iso.datetime(),refreshAfter:z.iso.datetime(),refreshDue:z.boolean(),truncated:z.boolean(),indexState:z.string(),workloads:z.array(z.string()),
}))});
export function SourceLibrary({customerId}:{customerId:string}){
  const [page,setPage]=useState(0),[retry,setRetry]=useState(0);
  const [result,setResult]=useState<z.infer<typeof librarySchema>|null>(null),[error,setError]=useState<string|null>(null);
  const [selected,setSelected]=useState<string|null>(null);
  useEffect(()=>{
    const controller=new AbortController();setResult(null);setError(null);setSelected(null);
    void(async()=>{try{
      const response=await fetch(`/api/customers/${encodeURIComponent(customerId)}/sources?offset=${page*20}`,{signal:controller.signal,cache:"no-store"});
      if(!response.ok)throw Error(response.status===401?"Sign in again to open the source library.":response.status===404?"This customer is unavailable to your account.":"The source library could not be loaded. Please retry.");
      const body=await response.json() as {data:unknown};const parsed=librarySchema.parse(body.data);
      if(!controller.signal.aborted)setResult(parsed);
    }catch(failure){if(!controller.signal.aborted)setError(failure instanceof Error?failure.message:"The source library could not be loaded.");}})();
    return()=>controller.abort();
  },[customerId,page,retry]);
  return <main className="profile-page">
    <Link href={`/customers/${customerId}`}>← Customer Profile</Link>
    <header className="profile-header"><div><p className="profile-eyebrow">Retained Research</p><h1>Research Source Library</h1>
      <p className="muted">Original public sources retained during research. Last checked is separate from publication and customer readiness.</p></div></header>
    {!result&&!error&&<p role="status" className="profile-state">Loading sources…</p>}
    {error&&<div role="alert" className="profile-state"><p>{error}</p><button className="secondary-button" onClick={()=>setRetry(value=>value+1)}>Retry</button></div>}
    {result?.sources.length===0&&<p className="profile-state">No research sources have been saved for this customer yet.</p>}
    <div className="profile-grid">{result?.sources.map(source=><article className="profile-card" key={source.id}>
      <h2><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a></h2>
      <p className="muted">{source.workloads.join(" · ")}</p>
      <p><span className="profile-label">Published: </span>{source.publishedAt??"Date not established"}</p>
      <p><span className="profile-label">Last checked: </span>{new Date(source.checkedAt).toLocaleString()}</p>
      <p>{source.refreshDue?"Refresh due before a current-state assessment.":"Within the current source-check window."}</p>
      <p className="muted">Search index: {source.indexState}</p>
      {source.truncated&&<p className="profile-note">The research view used a bounded excerpt; it does not establish whole-page coverage.</p>}
      {source.sourceRevisionId&&<button className="secondary-button" onClick={()=>setSelected(source.sourceRevisionId)}>View retained evidence</button>}
    </article>)}</div>
    {selected&&<EvidenceDetail customerId={customerId} sourceRevisionId={selected} canReview={false} onClose={()=>setSelected(null)} onChanged={()=>setRetry(value=>value+1)}/>}
    {result&&(page>0||result.more)&&<nav className="profile-toolbar" aria-label="Source pages">
      <button className="secondary-button" disabled={page===0} onClick={()=>setPage(value=>value-1)}>Previous</button>
      <span>Page {page+1}</span><button className="secondary-button" disabled={!result.more} onClick={()=>setPage(value=>value+1)}>Next</button>
    </nav>}
  </main>;
}
