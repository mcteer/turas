"use client";

import { useEffect,useState } from "react";
import type { PlanDiffChange } from "../../../lib/server/plans/diff";

type Comparison={contractVersion:"plan-diff-v1";changes:PlanDiffChange[]};
type Envelope={data?:Comparison;error?:{message:string}};

export function PlanDiff({planId,baseRevisionId,targetRevisionId}:{planId:string;
  baseRevisionId:string;targetRevisionId:string}) {
  const [comparison,setComparison]=useState<Comparison|null>(null);
  const [message,setMessage]=useState("");
  const [reload,setReload]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();
    const url=new URL(`/api/plans/${planId}/diff`,window.location.origin);
    url.searchParams.set("base",baseRevisionId);
    url.searchParams.set("target",targetRevisionId);
    void (async()=>{
      for(let attempt=0;attempt<2;attempt += 1){
        const response=await fetch(url,{cache:"no-store",signal:controller.signal});
        if(response.status===503 && attempt===0){
          await new Promise((resolve)=>setTimeout(resolve,500));
          continue;
        }
        const body=await response.json() as Envelope;
        if (!response.ok || !body.data) throw new Error(body.error?.message ?? "Comparison unavailable");
        setComparison(body.data);setMessage("");
        return;
      }
    })().catch((error:unknown)=>{
      if (error instanceof DOMException && error.name==="AbortError") return;
      setComparison(null);
      setMessage(error instanceof Error ? error.message:"Comparison unavailable");
    });
    return ()=>controller.abort();
  },[planId,baseRevisionId,targetRevisionId,reload]);
  return <section className="profile-section" aria-label="Revision comparison">
    <h2>Changes from accepted revision</h2>
    {message && <><p role="alert">{message}</p><button type="button"
      className="secondary-button" onClick={()=>{setMessage("");setReload((value)=>value+1);}}>
      Retry comparison</button></>}
    {!message && !comparison && <p role="status">Loading comparison…</p>}
    {comparison && (comparison.changes.length ? <ul>{comparison.changes.map((change)=><li
      key={`${change.area}:${change.key}:${change.kind}`}>
      {change.area}: {change.key} {change.kind}
      {change.fields.length ? ` (${change.fields.join(", ")})`:""}
    </li>)}</ul>:<p>No structured changes from the accepted revision.</p>)}
  </section>;
}
