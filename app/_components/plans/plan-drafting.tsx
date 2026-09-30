"use client";

import Link from "next/link";
import { useEveAgent } from "eve/react";
import { useEffect,useState } from "react";

type Head={planId:string;revisionId:string;aggregateVersion:number;
  audience:string;workloadId:string|null};
type Draft={attemptId:string;planId:string;baseRevisionId:string;
  baseAggregateVersion:number;conversationId:string;operationId:string;
  requestKey:string;state:string;deadlineAt:string;resultRevisionId:string|null;
  stepsAdmitted:number;retrievalCalls:number;contextBytes:number;
  safeErrorCode:string|null;instructions:string};
type Envelope<T>={data?:T;error?:{message:string;code:string}};

export function PlanDrafting({customerId,head,onSaved}:{customerId:string;
  head:Head;onSaved:()=>void}) {
  const [csrf,setCsrf]=useState("");
  const [instructions,setInstructions]=useState("Prepare a delivery proposal using current eligible evidence. Explain fit, alternatives, unknowns, owners, exit evidence and rollback. Save one draft for human review.");
  const [draft,setDraft]=useState<Draft|null>(null);
  const [nativeSessionId,setNativeSessionId]=useState<string|null>(null);
  const [recoveryAttemptId,setRecoveryAttemptId]=useState<string|null>(null);
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState("");
  const storageKey=`turas-plan-draft-${head.planId}`;

  useEffect(()=>{
    let live=true;
    void fetch("/api/auth/session",{cache:"no-store"}).then((r)=>r.json())
      .then((body:Envelope<{csrfToken:string}>)=>{
        if (live) setCsrf(body.data?.csrfToken ?? "");
      }).catch(()=>{if(live)setNotice("Sign in to draft a plan.");});
    const attemptId=sessionStorage.getItem(storageKey);
    if (attemptId) {
      void restoreAttempt(attemptId,()=>live);
    }
    return ()=>{live=false;};
  },[storageKey]);

  async function restoreAttempt(attemptId:string,isLive:()=>boolean=()=>true) {
    try {
      const response=await fetch(`/api/plan-drafting/${attemptId}`,{cache:"no-store"});
      const body=await response.json() as Envelope<Draft>;
      if (!response.ok || !body.data) throw new Error("Draft status unavailable");
      if (!isLive()) return;
      setDraft(body.data);setRecoveryAttemptId(null);setNotice("");
      if (body.data.instructions) setInstructions(body.data.instructions);
      const conversation=await fetch(`/api/conversations/${body.data.conversationId}`,
        {cache:"no-store"});
      const detail=await conversation.json() as Envelope<{eveSessionId:string|null}>;
      if (isLive() && conversation.ok) setNativeSessionId(detail.data?.eveSessionId ?? null);
    } catch {
      if (isLive()) {
        setRecoveryAttemptId(attemptId);
        setNotice("Draft status is unavailable. No request was resent.");
      }
    }
  }

  async function post<T>(path:string,body:unknown):Promise<T> {
    const response=await fetch(path,{method:"POST",headers:{
      "content-type":"application/json","x-csrf-token":csrf},
      body:JSON.stringify(body)});
    const parsed=await response.json() as Envelope<T>;
    if (!response.ok || !parsed.data) throw new Error(parsed.error?.message ?? "Drafting unavailable");
    return parsed.data;
  }

  async function start() {
    if (busy || !csrf || !instructions.trim() || draft) return;
    setBusy(true);setNotice("");
    const requestKey=crypto.randomUUID();
    try {
      const reserved=await post<Draft>("/api/plan-drafting",{
        requestKey,planId:head.planId,baseRevisionId:head.revisionId,
        expectedAggregateVersion:head.aggregateVersion,instructions:instructions.trim()});
      setDraft(reserved);
      sessionStorage.setItem(storageKey,reserved.attemptId);
      let nativeSession:string|null=null;
      for(let index=0;index<5;index += 1) {
        const response=await fetch("/eve/v1/session",{method:"POST",headers:{
          "content-type":"application/json","x-csrf-token":csrf,
          "x-turas-conversation-id":reserved.conversationId},
          body:JSON.stringify({operationId:reserved.operationId})});
        const payload=await response.json() as {sessionId?:string;code?:string};
        if(response.ok && payload.sessionId){nativeSession=payload.sessionId;break;}
        if(response.status!==409 || payload.code!=="turas_binding_pending") break;
        await new Promise((resolve)=>setTimeout(resolve,2_000));
      }
      if(!nativeSession){setNotice("Session binding is pending. Check status before sending again.");return;}
      setNativeSessionId(nativeSession);
      const sent=await fetch(`/eve/v1/session/${nativeSession}`,{method:"POST",headers:{
        "content-type":"application/json","x-csrf-token":csrf,
        "x-turas-conversation-id":reserved.conversationId,
        "x-turas-request-key":reserved.requestKey},
        body:JSON.stringify({message:reserved.instructions})});
      if(!sent.ok){
        setNotice("Dispatch was not confirmed. Check the saved attempt status; it was not resent.");
      } else setNotice("Turi is preparing a proposal. The saved revision will appear below.");
    } catch(error){setNotice(error instanceof Error ? error.message:"Drafting unavailable");}
    finally{setBusy(false);}
  }

  async function refresh() {
    if(!draft)return;
    try {
      const response=await fetch(`/api/plan-drafting/${draft.attemptId}`,{cache:"no-store"});
      const body=await response.json() as Envelope<Draft>;
      if(!response.ok || !body.data)throw new Error(body.error?.message ?? "Status unavailable");
      setDraft(body.data);
      if(body.data.state==="saved")onSaved();
      else if(["failed","unconfirmed","expired","cancelled"].includes(body.data.state))
        setNotice(`Draft ${body.data.state}. Review the status before starting a new attempt.`);
    } catch(error){setNotice(error instanceof Error ? error.message:"Status unavailable");}
  }

  async function cancel() {
    if(!draft || busy)return;
    setBusy(true);
    try {
      const result=await post<Draft>(`/api/plan-drafting/${draft.attemptId}/cancel`,{});
      setDraft(result);
      setNotice(result.state==="saved" ? "Draft saved before cancellation." :
        "Cancellation recorded. Checking the native response separately.");
    } catch(error){setNotice(error instanceof Error ? error.message:"Cancellation unavailable");}
    finally{setBusy(false);}
  }

  async function resumePrepared() {
    if(!draft || draft.state!=="prepared" || busy || !csrf)return;
    setBusy(true);setNotice("");
    try {
      const checked=await fetch(`/api/plan-drafting/${draft.attemptId}`,{cache:"no-store"});
      const checkedBody=await checked.json() as Envelope<Draft>;
      if(!checked.ok || checkedBody.data?.state!=="prepared") {
        if(checkedBody.data)setDraft(checkedBody.data);
        throw new Error("Attempt state changed. No request was resent.");
      }
      let nativeSession=nativeSessionId;
      if(!nativeSession) {
        const bound=await fetch("/eve/v1/session",{method:"POST",headers:{
          "content-type":"application/json","x-csrf-token":csrf,
          "x-turas-conversation-id":draft.conversationId},
          body:JSON.stringify({operationId:draft.operationId})});
        const payload=await bound.json() as {sessionId?:string};
        if(!bound.ok || !payload.sessionId) throw new Error("Session binding is pending. Check again.");
        nativeSession=payload.sessionId;setNativeSessionId(nativeSession);
      }
      const sent=await fetch(`/eve/v1/session/${nativeSession}`,{method:"POST",headers:{
        "content-type":"application/json","x-csrf-token":csrf,
        "x-turas-conversation-id":draft.conversationId,
        "x-turas-request-key":draft.requestKey},
        body:JSON.stringify({message:draft.instructions})});
      if(!sent.ok) throw new Error("Dispatch was not confirmed. Check status before any further action.");
      setNotice("Request admitted. Waiting for the saved result.");
      await refresh();
    } catch(error){setNotice(error instanceof Error ? error.message:"Dispatch unavailable");}
    finally{setBusy(false);}
  }

  return <section className="profile-section" aria-label="Turi plan drafting">
    <h2>Draft with Turi</h2>
    <p>Audience: {head.audience}. Workload: {head.workloadId ?? "Customer wide"}.</p>
    <p>Base revision {head.revisionId}. Up to six model steps, four evidence searches,
      and 24 KiB of governed context. Human review is required before acceptance.</p>
    {recoveryAttemptId && !draft && <button type="button" className="secondary-button"
      onClick={()=>void restoreAttempt(recoveryAttemptId)}>Retry status read</button>}
    {!draft && !recoveryAttemptId && <><label className="field-label" htmlFor="plan-draft-instructions">Drafting request</label>
      <textarea id="plan-draft-instructions" value={instructions}
        onChange={(event)=>setInstructions(event.target.value)} maxLength={8_000}/>
      <button className="primary-button" type="button" disabled={busy || !csrf ||
        !instructions.trim()} onClick={()=>void start()}>
        {busy ? "Starting…":"Ask Turi to draft"}</button></>}
    {draft && <div className="profile-card">
      <p role="status">{draft.state.replaceAll("_"," ")} · {draft.stepsAdmitted}/6 steps ·
        {draft.retrievalCalls}/4 searches · {draft.contextBytes}/24,576 context bytes</p>
      <p>Base revision {draft.baseRevisionId}. Deadline {new Date(draft.deadlineAt).toLocaleTimeString()}.</p>
      {draft.resultRevisionId && <p><Link href={`/customers/${customerId}/plans/${head.planId}`}>
        Open saved revision</Link></p>}
      {nativeSessionId && <ActivePlanDraft key={draft.attemptId}
        conversationId={draft.conversationId} nativeSessionId={nativeSessionId}
        csrf={csrf} onTerminal={()=>void refresh()} onCancel={()=>void cancel()}/>}
      <div className="chat-actions"><button type="button" className="secondary-button"
        onClick={()=>void refresh()}>Check saved status</button>
      {draft.state==="prepared" && <button type="button" className="secondary-button"
        disabled={busy || !csrf} onClick={()=>void resumePrepared()}>
        Send prepared request</button>}
      {["saved","failed","cancelled","expired","unconfirmed"].includes(draft.state) &&
        <button type="button" className="secondary-button" onClick={()=>{
          sessionStorage.removeItem(storageKey);
          setDraft(null);setNativeSessionId(null);setNotice("");
        }}>Start another draft</button>}
      {["prepared","running"].includes(draft.state) &&
        <button type="button" className="secondary-button" disabled={busy}
          onClick={()=>void cancel()}>Cancel draft</button>}</div>
    </div>}
    {notice && <p role="status" className="profile-note">{notice}</p>}
  </section>;
}

function ActivePlanDraft({conversationId,nativeSessionId,csrf,onTerminal,onCancel}:{
  conversationId:string;nativeSessionId:string;csrf:string;
  onTerminal:()=>void;onCancel:()=>void}) {
  const agent=useEveAgent({initialSession:{sessionId:nativeSessionId,streamIndex:0},
    resume:true,headers:()=>({"x-csrf-token":csrf,
      "x-turas-conversation-id":conversationId}),
    onEvent(event){if(["turn.completed","turn.failed","turn.cancelled"].includes(event.type))
      onTerminal();}});
  return <div className="chat-messages" aria-live="polite">
    {agent.data.messages.map((message)=><article className="chat-message" key={message.id}>
      <h3>{message.role==="assistant" ? "Turi":"You"}</h3>
      {message.parts.map((part,index)=>part.type==="text" ?
        <p key={index}>{part.text}</p>:null)}
    </article>)}
    {(agent.status==="streaming" || agent.status==="submitted") &&
      <button type="button" className="secondary-button" onClick={()=>{
        void agent.cancel().catch(()=>undefined).finally(onCancel);
      }}>Stop Turi</button>}
  </div>;
}
