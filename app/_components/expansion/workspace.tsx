"use client";
import Link from "next/link";
import {ExpansionAdvice,type ExpansionSuggestion} from "./advice";
import {readPendingExpansion,writePendingExpansion,pendingExpansionLabel,requirePendingReceipt,type PendingExpansionCommand,type ExpansionPendingManager} from "./pending";
import { useCallback, useEffect, useRef, useState } from "react";
import type { readExpansionWorkspace } from "../../../lib/server/expansion/projection";
import type { ExpansionHypothesis } from "../../../lib/contracts/expansion";
import type {ExpansionLink} from "../../../lib/server/expansion/schema";
import {ExpansionDeliveryLinks} from "./links";
import type { ExpansionSource } from "../../../lib/server/expansion/schema";
import {ExpansionRankingExplanation} from "./ranking";
import { ExpansionHistory } from "./history";
import { ExpansionReview } from "./review";
import { ExpansionOwner } from "./owner";
import { ExpansionEvidence } from "./evidence";
import { ExpansionCitation } from "./citation";
import {ExpansionRelatedComparison,type ExpansionRelatedView} from "./related";
import { ExpansionEditor } from "./editor";
type View = Awaited<ReturnType<typeof readExpansionWorkspace>>;
type Session = { membership: { kind: string }; csrfToken: string };
type Envelope<T> = { data?: T; error?: { message: string;code?:string } };
export function ExpansionWorkspace({ customerId,initialWorkloadId="" }: { customerId: string;initialWorkloadId?:string }) {
  const [selectedEngagementIds,setSelectedEngagementIds]=useState<string[]>([]),[deliveryLinks,setDeliveryLinks]=useState<ExpansionLink[]>([]);
  const [adviceOrigin,setAdviceOrigin]=useState<ExpansionSuggestion|null>(null);
  const [recordId,setRecordId]=useState<string|null>(null);
  const [related,setRelated]=useState<{comparison:ExpansionRelatedView;content:ExpansionHypothesis}|null>(null);
  const [disposition,setDisposition]=useState("");
  const [cursor,setCursor]=useState<string|null>(null);
  const [workloadId,setWorkloadId]=useState(initialWorkloadId);
  const [view, setView] = useState<View | null>(null), [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState("Loading expansion opportunities…"), [editor, setEditor] = useState(false);
  const [editing, setEditing] = useState<View['records'][number] | null>(null), [busy, setBusy] = useState(false);
  const [pending,setPending]=useState<PendingExpansionCommand|null>(null),[recoveryGeneration,setRecoveryGeneration]=useState(0); const pendingRef=useRef<PendingExpansionCommand|null>(null),active = useRef(false);
  const [sources, setSources] = useState<ExpansionSource[]>([]), [inspecting, setInspecting] = useState<ExpansionSource | null>(null);
  const base = `/api/expansion/customers/${encodeURIComponent(customerId)}`;
  const refresh = useCallback(async (signal?: AbortSignal) => {
    const query=new URLSearchParams();if(workloadId)query.set('workloadId',workloadId);if(disposition)query.set('disposition',disposition);if(cursor)query.set('cursor',cursor);if(recordId){query.set('recordId',recordId);query.delete('disposition');query.delete('cursor');}
    const [auth, response] = await Promise.all([fetch('/api/auth/session', { cache: 'no-store', signal }), fetch(`${base}${query.size?`?${query}`:""}`, { cache: 'no-store', signal })]);
    if(auth.ok&&response.status===409&&cursor){setCursor(null);setView(null);setInspecting(null);setStatus('Expansion view changed. Refreshing the first page…');return;}
    if (!auth.ok || !response.ok) { pendingRef.current=null;setPending(null);setView(null); setSession(null);setRelated(null); setEditor(false); setEditing(null); setStatus('Expansion is unavailable to your account.'); return; }
    const a = await auth.json() as Envelope<Session>, v = await response.json() as Envelope<View>;
    if (!a.data || !v.data) throw Error('Expansion unavailable'); setSession(a.data); setView(v.data); setStatus('');
    const remembered=readPendingExpansion(v.data.commandNamespace);pendingRef.current=remembered;setPending(remembered);
    if(remembered)setStatus('A previous command is unconfirmed. Check its status before continuing.');
  }, [base,workloadId,disposition,cursor,recordId]);
  useEffect(() => { const controller = new AbortController(); void refresh(controller.signal).catch(error => { if (error.name !== 'AbortError') setStatus('Expansion unavailable'); });
    return () => controller.abort(); }, [refresh]);
  const pendingManager:ExpansionPendingManager={blocked:!!pending,begin(command){
    if(!view||pendingRef.current)return false;pendingRef.current=command;setPending(command);writePendingExpansion(view.commandNamespace,command);return true;
  },finish(requestKey){
    if(!view||pendingRef.current?.requestKey!==requestKey)return;writePendingExpansion(view.commandNamespace,null);pendingRef.current=null;setPending(null);
  }};
  async function reconcile() {
    const command=pendingRef.current;if(!command||!view)return;
    try { const response = await fetch(`/api/expansion/receipts/${command.requestKey}`, { cache: 'no-store' });
      if (!response.ok) throw Error('Command remains unconfirmed. Check its status before continuing.');
      const result=await response.json() as Envelope<{customerId:string;operation:string;recordId:string|null}>;
      if(result.data?.customerId!==customerId||result.data.operation!==command.operation||command.recordId&&result.data.recordId!==command.recordId)throw Error('Command remains unconfirmed.');
      pendingManager.finish(command.requestKey);setRecoveryGeneration(value=>value+1);setEditor(false);setEditing(null);await refresh();
      setStatus(command.operation==='assign_owner'?'Assignment confirmed.':command.operation==='decide_hypothesis'?'Decision confirmed.':'Save confirmed.');
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Command remains unconfirmed.'); }
  }
  async function save(content: ExpansionHypothesis,duplicateAcknowledgement?:{relatedSetDigest:string;rationale:string}) {
    if (!session || !view || active.current || pendingRef.current) throw Error('Reconcile the previous save before continuing.');
    active.current = true; setBusy(true); const key = crypto.randomUUID();const origin=adviceOrigin,operation=origin?"save_suggestion" as const:"save_hypothesis" as const;
    if(!pendingManager.begin({requestKey:key,operation,workloadId:view.workloadId,...(editing?{recordId:editing.id}:{})})){active.current=false;setBusy(false);throw Error("Reconcile the previous command before continuing.");}
    try {
      const response = await fetch(`${base}/commands`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': session.csrfToken },
        body: JSON.stringify({ contractVersion: 'expansion-v1', operation, ...(origin?{attemptId:origin.attemptId,outputDigest:origin.outputDigest,suggestionIndex:origin.suggestionIndex}:{}), requestKey: key, workloadId: view.workloadId,
          expectedVersion: editing?.version ?? view.scopeGeneration, ...(editing ? { recordId: editing.id } : {}), content,
          ...(duplicateAcknowledgement?{duplicateAcknowledgement}:{}),sourceRefs: sources, selectedEngagementIds,deliveryLinks }) });
      const body = await response.json() as Envelope<unknown>;
      if (!response.ok) { if (response.status < 500){pendingManager.finish(key);}
        if(response.status===409&&body.error?.code==='duplicate_hypothesis'){
         const query=new URLSearchParams({productKey:content.productKey,problemKey:content.problemKey});if(view.workloadId)query.set('workloadId',view.workloadId);
         const comparisonResponse=await fetch(`${base}/related?${query}`,{cache:'no-store'});const comparisonBody=await comparisonResponse.json() as Envelope<ExpansionRelatedView>;
         if(comparisonResponse.ok&&comparisonBody.data)setRelated({comparison:comparisonBody.data,content});else setRelated(null);
        } throw Error(body.error?.message ?? 'Save unconfirmed'); }
      requirePendingReceipt(body.data,{requestKey:key,operation,workloadId:view.workloadId,...(editing?{recordId:editing.id}:{})},customerId);pendingManager.finish(key); setRelated(null);setAdviceOrigin(null);setEditor(false); setEditing(null); await refresh();
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Save unconfirmed'); throw error; }
    finally { active.current = false; setBusy(false); }
  }
  return <section className="profile-page"><Link href={`/customers/${customerId}`}>Customer Profile</Link>
    {status && <p role="status">{status}</p>}{pending && <button type="button" className="secondary-button" onClick={() => void reconcile()}>{pendingExpansionLabel(pending)}</button>}
    {view && session?.membership.kind === 'internal' && <><header className="profile-header"><div><p className="profile-eyebrow">{view.metadata.customerName}</p><h1>Expansion Opportunities</h1><p>Customer problems, potential benefits, and evidence for account-owner review.</p></div>
      <button className="secondary-button" type="button" disabled={busy||editor} onClick={()=>{setView(null);setInspecting(null);setStatus('Refreshing current evidence…');void refresh().catch(()=>setStatus('Expansion unavailable'));}}>Refresh Expansion</button>
      <button className="primary-button" type="button" disabled={busy || !!pending} onClick={() => { setAdviceOrigin(null);setRelated(null);setEditing(null);setSelectedEngagementIds([]);setDeliveryLinks([]); setSources([]); setEditor(true); }}>New Hypothesis</button></header>
      <label htmlFor="expansion-workload">Workload</label><select id="expansion-workload" className="field" value={workloadId} disabled={editor||busy||!!pending}
        onChange={event=>{const url=new URL(window.location.href);if(event.target.value)url.searchParams.set('workloadId',event.target.value);else url.searchParams.delete('workloadId');window.history.replaceState(null,'',url.pathname+url.search);setRelated(null);setRecordId(null);setCursor(null);setWorkloadId(event.target.value);setView(null);setSources([]);setInspecting(null);setEditing(null);setStatus('Loading expansion scope…');}}>
        <option value="">Customer-Wide</option>{view.metadata.workloads.map(workload=><option key={workload.id} value={workload.id}>{workload.name}</option>)}</select>
      <label htmlFor="expansion-disposition">Disposition Filter</label><select id="expansion-disposition" className="field" value={disposition} disabled={editor||busy||!!pending} onChange={event=>{setRelated(null);setRecordId(null);setDisposition(event.target.value);setCursor(null);setView(null);setInspecting(null);}}><option value="">Active: Proposed and Qualified</option><option value="proposed">Proposed</option><option value="qualified">Qualified</option><option value="deferred">Deferred</option><option value="dismissed">Dismissed</option></select>
      {recordId&&<button type="button" className="secondary-button" onClick={()=>{setRecordId(null);setView(null);setCursor(null);}}>Back to Expansion List</button>}
      {cursor&&<button type="button" className="secondary-button" onClick={()=>{setCursor(null);setView(null);}}>First Page</button>}
      {editor&&<p>Save or cancel this draft before changing workload.</p>}
      {view.assignment.active?<p>Account Owner: {view.metadata.owners.find(member=>member.id===view.assignment.membershipId)?.name??'Assigned internal member'}</p>:<p>Account Owner Unassigned</p>}
      <ExpansionAdvice customerId={customerId} workloadId={view.workloadId} scopeGeneration={view.scopeGeneration} namespace={view.commandNamespace} csrfToken={session.csrfToken} records={view.records.map(record=>({id:record.id,title:record.working.payload?.content.title??'Hypothesis content unavailable'}))} blocked={busy||!!pending} editor={editor} onReview={(origin,refs,engagements)=>{setAdviceOrigin(origin);setRelated(null);setEditing(null);setSources(refs);setSelectedEngagementIds(engagements);setDeliveryLinks([]);setEditor(true);}} onWithheld={()=>{if(adviceOrigin){setAdviceOrigin(null);setEditor(false);setSources([]);setSelectedEngagementIds([]);setDeliveryLinks([]);setRelated(null);setInspecting(null);}}}/>
      {view.canManageOwner && <ExpansionOwner key={`owner:${recoveryGeneration}`} customerId={customerId} csrfToken={session.csrfToken} pending={pendingManager} onChanged={refresh} />}
      {editor && !related && <ExpansionEvidence customerId={customerId} workloadId={view.workloadId} csrfToken={session.csrfToken} selected={sources} onChange={setSources} onInspect={setInspecting} />}
      {inspecting && <ExpansionCitation customerId={customerId} workloadId={view.workloadId} source={inspecting} recordId={editing?.id} revisionId={editing?.workingRevisionId??undefined} onClose={() => setInspecting(null)} />}
      {editor&&<ExpansionDeliveryLinks customerId={customerId} workloadId={view.workloadId} selected={selectedEngagementIds} links={deliveryLinks} busy={busy||!!pending||!!related} onChange={(selected,links)=>{setSelectedEngagementIds(selected);setDeliveryLinks(links);setRelated(null);}}/>}
      {related&&<ExpansionRelatedComparison key={related.comparison.relatedSetDigest} comparison={related.comparison} busy={busy||!!pending} onSave={rationale=>save(related.content,{relatedSetDigest:related.comparison.relatedSetDigest,rationale})} onCancel={()=>setRelated(null)} onOpen={id=>{setEditor(false);setEditing(null);setRelated(null);setRecordId(id);setView(null);setInspecting(null);}}/>}
      {editor && <ExpansionEditor key={adviceOrigin?`${adviceOrigin.attemptId}:${adviceOrigin.suggestionIndex}`:editing?.workingRevisionId??"new"} sources={sources} owners={view.metadata.owners} initial={adviceOrigin?.content??editing?.working.payload?.content} existingRecord={!!editing} busy={busy || !!pending || !!related} onSave={save} onCancel={() => {setAdviceOrigin(null);setRelated(null); setEditor(false); setEditing(null); }} />}
      {!view.records.length && <div className="profile-state"><h2>No Expansion Hypotheses Yet</h2><p>Start with an evidenced need or an honest discovery proposal.</p></div>}
      {view.records.map(record => <article key={record.id} className="profile-card"><h2>{record.working.payload?.content.title ?? 'Hypothesis Content Unavailable'}</h2>
        <p>{record.disposition==='qualified'&&record.workingRevisionId!==record.decidedRevisionId?'Last Decided Disposition: Qualified':`Disposition: ${record.disposition[0].toUpperCase()+record.disposition.slice(1)}`}</p>
        {record.lastDecision&&<div><p>Reviewed By: {record.lastDecision.reviewerName}</p><p>Decision Date: {record.lastDecision.createdAt}</p>{record.lastDecision.revisitDate&&<p>Revisit Date: {record.lastDecision.revisitDate}</p>}{record.lastDecision.rationale&&<p>{record.lastDecision.rationale}</p>}</div>}
        {record.disposition==='qualified'&&record.workingRevisionId!==record.decidedRevisionId&&<p className="profile-caution">Working Revision: Proposed Changes — Owner Review Required</p>}
        {record.decidedRevisionId&&record.decidedRevisionId!==record.workingRevisionId&&<details><summary>Last Decided Revision</summary>{record.decided.payload?<><h3>{record.decided.payload.content.title}</h3><p>{record.decided.payload.content.problem}</p></>:<p>Evidence Changed — Decided Content Withheld</p>}</details>}
        {record.working.payload && <><p>{record.working.payload.content.problem}</p><p>{record.working.payload.content.customerBenefit}</p>
          <p>Current Use: {record.working.payload.content.currentUse.kind === "unknown" ? "Unknown" : record.working.payload.content.currentUse.state}</p>
          <p>Benefit: {record.working.payload.content.benefit.kind.replaceAll('_', ' ')}</p>
          <button className="secondary-button" type="button" disabled={busy || !!pending} onClick={() => { setAdviceOrigin(null);setEditing(record);setSelectedEngagementIds(record.working.payload?.selectedEngagementIds??[]);setDeliveryLinks(record.working.payload?.deliveryLinks??[]); setSources(record.working.payload?.sourceRefs ?? []); setEditor(true); }}>Edit Hypothesis</button></>}
        {!record.working.payload&&<button className="secondary-button" type="button" disabled={busy||!!pending} onClick={()=>{setAdviceOrigin(null);setEditing(record);setSelectedEngagementIds([]);setDeliveryLinks([]);setSources([]);setEditor(true);}}>Create Fresh Working Revision</button>}
        <ExpansionHistory key={`${record.version}:${record.working.availability}:${view.scopeGeneration}`} customerId={customerId} workloadId={view.workloadId} recordId={record.id} />
        <ExpansionReview key={`review:${record.id}:${record.version}:${record.working.availability}:${view.assignment.version}:${recoveryGeneration}`} customerId={customerId} workloadId={view.workloadId} record={record} csrfToken={session.csrfToken} pending={pendingManager} onChanged={async()=>{await refresh();setStatus("Owner decision saved.");}} />
        {record.working.payload?.deliveryLinks.map((link,index)=><p key={index}><Link href={link.kind==='plan_revision'?`/customers/${customerId}/plans/${link.planId}`:`/customers/${customerId}/engagements/${link.engagementId}`}>{link.kind==='plan_revision'?'Open Delivery Plan':'Open Engagement'}</Link> · Exact Reference: {'revisionId' in link?link.revisionId:link.baselineId}</p>)}
        <ExpansionRankingExplanation ranking={record.ranking}/>
        {record.reviewReasons.map(reason => <p key={reason} className="profile-caution">{reason}</p>)}</article>)}
      {view.nextCursor&&<button className="secondary-button" type="button" disabled={busy||editor||!!pending} onClick={()=>{setCursor(view.nextCursor);setView(null);setInspecting(null);}}>Next Page</button>}
    </>}
  </section>;
}
