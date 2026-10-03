"use client";
import { useEffect, useRef, useState } from "react";
import { useEveAgent } from "eve/react";
import { z } from "zod";
import { executionAdvicePrompt } from "../../../lib/execution/advice";
import type { readExecutionAdviceStatus } from "../../../lib/server/execution/advisory-status";
import type { Overview, Session } from "./types";

type Status = Awaited<ReturnType<typeof readExecutionAdviceStatus>>;
type Prepared = { attemptId:string;conversationId:string;operationId:string;nativeRequestId:string };
const pendingSchema = z.object({ chatKey:z.uuid(),requestKey:z.uuid(),from:z.iso.date(),to:z.iso.date(),expectedGeneration:z.number().int().positive(),conversationId:z.uuid().optional() }).strict();
type Pending = z.infer<typeof pendingSchema>;
const terminal = new Set(["completed","failed","cancelled","expired","unconfirmed"]);
const stateLabel: Record<string,string> = {prepared:"Ready to Send",running:"Preparing Your Explanation",completed:"Explanation Complete",failed:"Explanation Unavailable",cancelled:"Explanation Stopped",expired:"Request Expired",unconfirmed:"Completion Unconfirmed"};
class RequestFailure extends Error { constructor(message:string,readonly status:number){super(message);} }
async function getStatus(id:string):Promise<Status> {
  const response=await fetch(`/api/execution/advice/${id}`,{cache:"no-store"}),body=await response.json();
  if(!response.ok||!body.data)throw new RequestFailure(body.error?.message??"Current status unavailable",response.status);
  return body.data;
}
export function ExecutionAdvisory({view,session}:{view:Overview;session:Session}) {
  const today = new Date().toISOString().slice(0,10);
  const [from,setFrom]=useState(today),[to,setTo]=useState(today),[status,setStatus]=useState<Status|null>(null),[savedId,setSavedId]=useState<string|null>(null);
  const [busy,setBusy]=useState(false),[notice,setNotice]=useState(""),[uncertain,setUncertain]=useState(false),[readFailed,setReadFailed]=useState(false),[stopped,setStopped]=useState(false);
  const pending=useRef<Pending|null>(null),alive=useRef(true),readSequence=useRef(0),sending=useRef(false);
  const storageKey=`turas-execution-advice-${session.membership.id}-${view.engagementId}`;
  const eligible=view.initialized&&!view.reviewRequired&&!view.writesDisabled&&session.membership.kind==="internal";
  const savePending=()=>sessionStorage.setItem(`${storageKey}-pending`,JSON.stringify(pending.current));
  async function refresh(id:string){
    const ticket=++readSequence.current;
    try { const next=await getStatus(id);if(!alive.current||ticket!==readSequence.current)return;setStatus(next);setReadFailed(false);if(terminal.has(next.state))setNotice(current=>current==="Turi is reviewing the accepted delivery evidence."?"":current); }
    catch {if(alive.current&&ticket===readSequence.current){setReadFailed(true);setNotice("Current status is unavailable. Check again before continuing.");}}
  }
  useEffect(()=>{
    alive.current=true;
    const stored=sessionStorage.getItem(storageKey),raw=sessionStorage.getItem(`${storageKey}-pending`);
    if(raw){try{pending.current=pendingSchema.parse(JSON.parse(raw));if(!stored)setUncertain(true);}catch{sessionStorage.removeItem(`${storageKey}-pending`);}}
    if(stored&&z.uuid().safeParse(stored).success){setSavedId(stored);void refresh(stored);}
    return()=>{alive.current=false;readSequence.current++;};
  },[storageKey]);
  useEffect(()=>{
    if(!savedId)return;
    const read=()=>void refresh(savedId),timer=setInterval(read,5000);
    const visibility=()=>{if(document.visibilityState==="hidden"){readSequence.current++;setReadFailed(true);}else read();};
    window.addEventListener("focus",read);document.addEventListener("visibilitychange",visibility);
    return()=>{clearInterval(timer);window.removeEventListener("focus",read);document.removeEventListener("visibilitychange",visibility);};
  },[savedId]);
  async function post<T>(url:string,body:unknown):Promise<T>{
    const response=await fetch(url,{method:"POST",headers:{"content-type":"application/json","x-csrf-token":session.csrfToken},body:JSON.stringify(body)}),envelope=await response.json();
    if(!response.ok||!envelope.data)throw new RequestFailure(envelope.error?.message??"Explanation unavailable",response.status);
    return envelope.data;
  }
  async function dispatch(reserved:Prepared){
    const current=await getStatus(reserved.attemptId);
    if(current.state!=="prepared"||current.responseAttemptId){setStatus(current);throw new Error("Check the saved result. This request already has a dispatch outcome.");}
    const bound=await fetch("/eve/v1/session",{method:"POST",headers:{"content-type":"application/json","x-csrf-token":session.csrfToken,"x-turas-conversation-id":reserved.conversationId},body:JSON.stringify({operationId:reserved.operationId})});
    const binding=await bound.json();if(!bound.ok||!binding.sessionId)throw new Error("Session preparation is pending. Check saved status.");
    // One explicit native POST. Network ambiguity never triggers another send.
    const sent=await fetch(`/eve/v1/session/${binding.sessionId}`,{method:"POST",headers:{"content-type":"application/json","x-csrf-token":session.csrfToken,
      "x-turas-conversation-id":reserved.conversationId,"x-turas-request-key":reserved.nativeRequestId},body:JSON.stringify({message:executionAdvicePrompt})});
    await sent.body?.cancel();if(!sent.ok)throw new Error("Sending is unconfirmed. Check saved status; the explanation was not resent.");
    setNotice("Turi is reviewing the accepted delivery evidence.");
  }
  async function start(recover=false){
    if(sending.current||!eligible)return;sending.current=true;setBusy(true);setNotice("");
    if(!recover){pending.current={chatKey:crypto.randomUUID(),requestKey:crypto.randomUUID(),from,to,expectedGeneration:view.generation};savePending();}
    let reserved:Prepared|null=null;
    try {
      const draft=pending.current;if(!draft)throw new Error("Preparation unavailable");
      if(!draft.conversationId){const chat=await post<{id:string}>("/api/conversations",{requestKey:draft.chatKey,customerId:view.customerId,title:"Execution explanation"});draft.conversationId=chat.id;savePending();}
      reserved=await post<Prepared>(`/api/execution/engagements/${view.engagementId}/advice`,{requestKey:draft.requestKey,conversationId:draft.conversationId,expectedGeneration:draft.expectedGeneration,from:draft.from,to:draft.to});
      sessionStorage.setItem(storageKey,reserved.attemptId);if(!alive.current)return;setSavedId(reserved.attemptId);setUncertain(false);
      if(!recover)await dispatch(reserved);
    }catch(error){if(alive.current){if(!reserved){const rejected=error instanceof RequestFailure&&[400,401,403,404,409,413,422,429].includes(error.status);setUncertain(!rejected);if(rejected){pending.current=null;sessionStorage.removeItem(`${storageKey}-pending`);}}setNotice(error instanceof Error?error.message:"Preparation unconfirmed. Check before sending.");}}
    finally{sending.current=false;if(alive.current){setBusy(false);if(reserved)void refresh(reserved.attemptId);}}
  }
  async function sendPrepared(){
    if(!status?.nativeRequestId||sending.current||!eligible)return;sending.current=true;setBusy(true);
    try{await dispatch({...status,nativeRequestId:status.nativeRequestId});}catch(error){setNotice(error instanceof Error?error.message:"Sending unconfirmed");}
    finally{sending.current=false;if(alive.current){setBusy(false);void refresh(status.attemptId);}}
  }
  async function cancel(){
    if(!savedId||sending.current)return;sending.current=true;setBusy(true);setStopped(true);setReadFailed(true);
    try{const next=await post<Status>(`/api/execution/advice/${savedId}/cancel`,{});if(!alive.current)return;setStatus(next);setNotice("Stop recorded. Later output is withheld.");
      if(next.nativeSessionId&&next.nativeTurnId&&next.responseState==="stopping"){
        const response=await fetch(`/eve/v1/session/${next.nativeSessionId}/cancel`,{method:"POST",headers:{"content-type":"application/json","x-csrf-token":session.csrfToken},body:JSON.stringify({turnId:next.nativeTurnId})});
        await response.body?.cancel();if(!response.ok)setNotice("Stop is recorded. Native acknowledgement is unconfirmed.");
      }
    }catch{if(alive.current)setNotice("Stop acknowledgement is unavailable. Check saved status.");}
    finally{sending.current=false;if(alive.current){setBusy(false);void refresh(savedId);}}
  }
  const changed=status&&(status.generation!==view.generation||status.baselineId!==view.baselineId||view.reviewRequired),withheld=changed||status?.fenced||readFailed||stopped;
  return <section className="profile-section" aria-label="Turi Execution Explanation"><div className="profile-section-heading"><div><p className="profile-eyebrow">Delivery Insight</p><h2>Explain with Turi</h2></div></div>
    <p className="muted">A cited explanation of reviewed milestones, blockers, effort, and handoff. Acceptance and delivery decisions remain with your reviewer.</p>
    {!eligible&&<p role="status">A current reviewed engagement and internal access are required to start an explanation.</p>}
    {!savedId&&!uncertain&&<form onSubmit={event=>{event.preventDefault();void start();}}><fieldset className="profile-quality" disabled={busy||!eligible}><legend>Explanation Period</legend>
      <div className="execution-period"><label>Period start<input className="field" type="date" required value={from} onChange={e=>setFrom(e.target.value)}/></label><label>Period end<input className="field" type="date" required min={from} value={to} onChange={e=>setTo(e.target.value)}/></label></div>
      <p className="muted">Up to 91 dates. Lifetime effort stays separate from this period.</p><button className="primary-button" type="submit" disabled={!session.csrfToken}>Ask Turi to explain</button>
    </fieldset></form>}
    {uncertain&&!savedId&&<div className="profile-card"><h3>Preparation Unconfirmed</h3><p>Check the existing request before sending an explanation.</p><button className="secondary-button" type="button" disabled={busy||!eligible} onClick={()=>void start(true)}>Check preparation</button></div>}
    {savedId&&<div className="profile-card"><h3>{status?stateLabel[status.state]??"Checking Saved Status":"Checking Saved Status"}</h3>
      {withheld&&<p role="status" className="profile-caution">Current evidence or access has changed. Output is withheld.</p>}
      {status?.state==="unconfirmed"&&<p role="status">The provider result is unconfirmed. This request will not be sent again.</p>}
      <div className="execution-actions"><button className="secondary-button" type="button" disabled={busy} onClick={()=>void refresh(savedId)}>Check saved status</button>
        {status?.state==="prepared"&&!status.responseAttemptId&&<button className="primary-button" type="button" disabled={busy||!eligible} onClick={()=>void sendPrepared()}>Send prepared explanation</button>}
        {(!status||!terminal.has(status.state))&&<button className="secondary-button" type="button" disabled={busy} onClick={()=>void cancel()}>Stop explanation</button>}
        {status&&terminal.has(status.state)&&<button className="secondary-button" type="button" disabled={busy||!eligible} onClick={()=>{readSequence.current++;sessionStorage.removeItem(storageKey);sessionStorage.removeItem(`${storageKey}-pending`);pending.current=null;setSavedId(null);setStatus(null);setUncertain(false);setReadFailed(false);setStopped(false);setNotice("");}}>Start another explanation</button>}
      </div>
      {status?.outputReadable&&status.nativeSessionId&&!withheld&&<ExecutionOutput key={status.attemptId} status={status} csrf={session.csrfToken} refresh={()=>void refresh(savedId)} unavailable={()=>{setReadFailed(true);setNotice("The output stream is unavailable. Check current status.");}}/>}
      {status&&<details><summary>Request Details</summary><p>{status.stepsAdmitted}/6 model steps · {status.readCalls}/6 evidence reads</p><p>Reported input tokens: {status.inputTokens??"Unknown"}. Reported output tokens: {status.outputTokens??"Unknown"}.</p></details>}
    </div>}
    {notice&&<p className="profile-note" role="status">{notice}</p>}
  </section>;
}
function ExecutionOutput({status,csrf,refresh,unavailable}:{status:Status;csrf:string;refresh:()=>void;unavailable:()=>void}){
  const agent=useEveAgent({initialSession:{sessionId:status.nativeSessionId!,streamIndex:0},resume:true,headers:()=>({"x-csrf-token":csrf,"x-turas-conversation-id":status.conversationId}),onError:unavailable,
    onEvent(event){if(["turn.completed","turn.failed","turn.cancelled"].includes(event.type))refresh();}});
  if(agent.error)return <p role="status">Output is unavailable. Check saved status.</p>;
  return <div className="chat-messages" aria-live="polite">{agent.data.messages.filter(m=>m.role==="assistant").map(m=><article className="chat-message" key={m.id}><h3>Turi</h3>{m.parts.map((p,i)=>p.type==="text"?<p key={i}>{p.text}</p>:null)}</article>)}</div>;
}
