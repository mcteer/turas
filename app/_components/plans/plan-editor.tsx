"use client";

import { titleCaseLabel } from "../title-case-label";

import Link from "next/link";
import { useEffect,useState } from "react";
import { editablePlanSectionKeys,type PlanDraftContent } from "../../../lib/contracts/plan-content";
import { PlanDiagram } from "./plan-diagram";

type Session={workspace:{id:string};membership:{id:string;kind:string};csrfToken:string};
type Envelope<T>={data?:T;error?:{message:string}};
type Head={planId:string;revisionId:string;aggregateVersion:number;
  contentDigest:string;reviewState:string;acceptedRevisionId:string|null};
type Citation={citationId:string;sourceKind:string;sourceRevisionId:string;
  sourceGeneration:number;contentDigest:string;locators:PlanDraftContent["sourceDependencies"][number]["locator"][];
  text:string};
type Result={citationId:string;title:string;text:string;caveats:string[]};

function blankContent():PlanDraftContent {
  return {title:"New delivery plan",asOf:new Date().toISOString(),
    sections:editablePlanSectionKeys.map((key)=>({key,state:"unknown" as const,
      ownerRole:"Delivery owner",discoveryAction:"Confirm this section during discovery"})),
    assertions:[],sourceDependencies:[],diagrams:[],designDecisions:[],
    workPackages:[],milestones:[],reusedSolutions:[]};
}
function clone<T>(value:T):T {return structuredClone(value);}
function label(key:string):string {return key.replaceAll("_"," ");}

export function PlanEditor({customerId,planId,onSaved}:{
  customerId:string;planId?:string;onSaved?:(planId:string)=>void}) {
  const [session,setSession]=useState<Session|null>(null);
  const [head,setHead]=useState<Head|null>(null);
  const [content,setContent]=useState<PlanDraftContent>(blankContent);
  const [audience,setAudience]=useState<"internal"|"delivery">("delivery");
  const [workloadId,setWorkloadId]=useState("");
  const [workloads,setWorkloads]=useState<{id:string;displayName:string;lifecycle:string}[]>([]);
  const [profileReady,setProfileReady]=useState(false);
  const [changeReason,setChangeReason]=useState("Updated plan after review");
  const [query,setQuery]=useState("");
  const [results,setResults]=useState<Result[]>([]);
  const [busy,setBusy]=useState(false);
  const [dirty,setDirty]=useState(false);
  const [message,setMessage]=useState("");
  useEffect(()=>{
    let live=true;
    void fetch("/api/auth/session",{cache:"no-store"}).then((r)=>r.json())
      .then((body:Envelope<Session>)=>{if(live && body.data)setSession(body.data);});
    if (!planId) void fetch(`/api/customers/${customerId}/profile`,{cache:"no-store"})
      .then((r)=>r.json()).then((body:Envelope<{workloads:typeof workloads}>)=>{
        if(live && body.data){setWorkloads(body.data.workloads.filter((item)=>
          item.lifecycle==="active"));setProfileReady(true);}
        else if(live) setMessage("Customer profile unavailable");
      }).catch(()=>{if(live)setMessage("Customer profile unavailable");});
    if (planId) void fetch(`/api/plans/${planId}`,{cache:"no-store"}).then((r)=>r.json())
      .then((body:Envelope<{content:PlanDraftContent;revisionId:string;
        aggregateVersion:number;contentDigest:string;reviewState:string;
        acceptedRevisionId:string|null;
        contentAvailability:string;audience:"internal"|"delivery";workloadId:string|null}>)=>{
        const data=body.data;
        if (!live || !data) return;
        if (!["readable","historical_warning"].includes(data.contentAvailability)) {
          setMessage("Plan content requires review");return;
        }
        setContent({...data.content,sections:data.content.sections.filter((section)=>
          !["evidence","decision"].includes(section.key))});
        setAudience(data.audience);setWorkloadId(data.workloadId ?? "");
        setHead({planId,revisionId:data.revisionId,aggregateVersion:data.aggregateVersion,
          contentDigest:data.contentDigest,reviewState:data.reviewState,
          acceptedRevisionId:data.acceptedRevisionId});
      });
    return ()=>{live=false;};
  },[planId,customerId]);
  useEffect(()=>{
    if (!dirty) return;
    const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();};
    window.addEventListener("beforeunload",warn);
    return ()=>window.removeEventListener("beforeunload",warn);
  },[dirty]);
  const change=(mutate:(draft:PlanDraftContent)=>void)=>{
    setContent((current)=>{const next=clone(current);mutate(next);return next;});
    setDirty(true);
  };
  async function post(path:string,body:unknown) {
    if (!session) throw new Error("Sign in again");
    const response=await fetch(path,{method:"POST",headers:{"content-type":"application/json",
      "x-csrf-token":session.csrfToken},body:JSON.stringify(body)});
    const envelope=await response.json() as Envelope<Head>;
    if (!response.ok || !envelope.data) throw new Error(envelope.error?.message ?? "Plan unavailable");
    return envelope.data;
  }
  async function save() {
    setBusy(true);setMessage("");
    try {
      const requestKey=crypto.randomUUID();
      const result=head ? await post(`/api/plans/${head.planId}/revisions`,{
        requestKey,expectedAggregateVersion:head.aggregateVersion,
        parentRevisionId:head.revisionId,baseAcceptedRevisionId:head.acceptedRevisionId,
        changeReason,content}) : await post("/api/plans",{
        requestKey,workspaceId:session?.workspace.id,customerId,
        workloadId:workloadId || null,audience,
        ownerMembershipId:session?.membership.id,content});
      setHead({...result,acceptedRevisionId:head?.acceptedRevisionId ?? null});
      setDirty(false);setMessage("Draft saved");onSaved?.(result.planId);
    } catch(error) {setMessage(error instanceof Error ? error.message:"Could not save plan");}
    finally {setBusy(false);}
  }
  async function submit() {
    if (!head) return;
    setBusy(true);setMessage("");
    try {
      const result=await post(`/api/plans/${head.planId}/submit`,{
        requestKey:crypto.randomUUID(),expectedAggregateVersion:head.aggregateVersion,
        revisionId:head.revisionId,contentDigest:head.contentDigest});
      setHead({...result,acceptedRevisionId:head.acceptedRevisionId});
      setMessage("Submitted for exact human review");
    } catch(error) {setMessage(error instanceof Error ? error.message:"Could not submit plan");}
    finally {setBusy(false);}
  }
  async function search() {
    if (!session || !query.trim()) return;
    setBusy(true);setMessage("");
    try {
      const response=await fetch("/api/retrieval/search",{method:"POST",
        headers:{"content-type":"application/json","x-csrf-token":session.csrfToken},
        body:JSON.stringify({scope:"combined",customerId,
          workloadId:workloadId || undefined,query,use:"discovery",limit:5})});
      const envelope=await response.json() as Envelope<{results:Result[]}>;
      if (!response.ok || !envelope.data) throw new Error(envelope.error?.message ?? "Search unavailable");
      setResults(envelope.data.results);
    } catch(error) {setMessage(error instanceof Error ? error.message:"Search unavailable");}
    finally {setBusy(false);}
  }
  async function attach(result:Result) {
    setBusy(true);setMessage("");
    try {
      const response=await fetch(`/api/retrieval/citations/${result.citationId}`,{cache:"no-store"});
      const envelope=await response.json() as Envelope<Citation>;
      const source=envelope.data;
      if (!response.ok || !source || !source.locators[0]) throw new Error("Citation unavailable");
      change((draft)=>draft.sourceDependencies.push({id:crypto.randomUUID(),
        kind:source.sourceKind==="published_shared" ? "shared_knowledge":
          source.sourceKind as PlanDraftContent["sourceDependencies"][number]["kind"],
        sourceRevisionId:source.sourceRevisionId,generation:source.sourceGeneration,
        contentDigest:source.contentDigest,locator:source.locators[0],
        citationId:source.citationId}));
      setResults([]);setMessage("Source attached. Link it to a factual assertion.");
    } catch(error) {setMessage(error instanceof Error ? error.message:"Citation unavailable");}
    finally {setBusy(false);}
  }

  return <section className="profile-section plan-editor" aria-label="Plan editor">
    <div className="profile-section-head"><h2>{head ? "Revise Plan":"Create Plan"}</h2>
      <span>{dirty ? "Unsaved changes":head?.reviewState ?? "New draft"}</span></div>
    {message && <p role="status" className="profile-note">{message}</p>}
    <label>Title<input className="field" value={content.title} maxLength={160}
      onChange={(event)=>change((draft)=>{draft.title=event.target.value;})}/></label>
    {!head && <div className="plan-grid"><label>Audience<select className="field" value={audience}
      onChange={(event)=>setAudience(event.target.value as "internal"|"delivery")}>
      {session?.membership.kind!=="partner" && <option value="internal">Internal</option>}
      <option value="delivery">Delivery</option></select></label>
      <label>Workload<select className="field" value={workloadId}
        onChange={(event)=>setWorkloadId(event.target.value)}>
        <option value="">Customer-wide</option>{workloads.map((item)=><option key={item.id}
          value={item.id}>{item.displayName}</option>)}
      </select></label></div>}
    {head && <label>Reason for revision<input className="field" value={changeReason}
      onChange={(event)=>setChangeReason(event.target.value)} maxLength={2_000}/></label>}
    <details open><summary>Plan Sections</summary>
      {content.sections.map((section,index)=><fieldset key={section.key} className="profile-card">
        <legend>{titleCaseLabel(section.key)}</legend>
        <label>Status<select className="field" value={section.state}
          onChange={(event)=>change((draft)=>{
            const item=draft.sections[index];item.state=event.target.value as typeof item.state;
            item.narrative=undefined;item.ownerRole=undefined;item.discoveryAction=undefined;
            item.reason=undefined;
          })}><option value="content">Content</option><option value="unknown">Unknown</option>
          <option value="not_applicable">Not applicable</option></select></label>
        {section.state==="content" && <label>Plan narrative<textarea className="field"
          value={section.narrative ?? ""} maxLength={4_000}
          onChange={(event)=>change((draft)=>{draft.sections[index].narrative=event.target.value;})}/></label>}
        {section.state==="unknown" && <div className="plan-grid">
          <label>Owner role<input className="field" value={section.ownerRole ?? ""}
            onChange={(event)=>change((draft)=>{draft.sections[index].ownerRole=event.target.value;})}/></label>
          <label>Discovery action<input className="field" value={section.discoveryAction ?? ""}
            onChange={(event)=>change((draft)=>{draft.sections[index].discoveryAction=event.target.value;})}/></label></div>}
        {section.state==="not_applicable" && <label>Reason<input className="field"
          value={section.reason ?? ""} onChange={(event)=>change((draft)=>{
            draft.sections[index].reason=event.target.value;})}/></label>}
      </fieldset>)}</details>
    <details><summary>Evidence and Assertions</summary>
      <div className="plan-inline"><label>Search eligible evidence<input className="field"
        value={query} onChange={(event)=>setQuery(event.target.value)}/></label>
        <button type="button" className="secondary-button" onClick={()=>void search()} disabled={busy}>Search</button></div>
      {results.map((result)=><article className="profile-card" key={result.citationId}>
        <h3>{result.title}</h3><p>{result.text}</p>
        {result.caveats.map((caveat)=><p key={caveat} className="profile-caution">{caveat}</p>)}
        <button type="button" className="secondary-button" onClick={()=>void attach(result)}
          disabled={busy}>Attach exact source</button></article>)}
      {content.sourceDependencies.map((source)=><p key={source.id}>
        {label(source.kind)} · {source.sourceRevisionId}
        <button type="button" className="secondary-button" onClick={()=>change((draft)=>{
          draft.sourceDependencies=draft.sourceDependencies.filter((item)=>item.id!==source.id);
          draft.assertions=draft.assertions.filter((item)=>
            !item.sourceDependencyIds.includes(source.id));
        })}>Remove</button></p>)}
      {content.assertions.map((assertion,index)=><fieldset className="profile-card" key={assertion.key}>
        <legend>Assertion {index+1}</legend><label>Text<input className="field" value={assertion.text}
          onChange={(event)=>change((draft)=>{draft.assertions[index].text=event.target.value;})}/></label>
        <label>Kind<select className="field" value={assertion.kind} onChange={(event)=>change((draft)=>{
          draft.assertions[index].kind=event.target.value as typeof assertion.kind;})}>
          {["accepted_fact","attributed_research","shared_practice","proposal","estimate","assumption"]
            .map((kind)=><option key={kind} value={kind}>{label(kind)}</option>)}</select></label>
        <label>Supporting source<select className="field"
          value={assertion.sourceDependencyIds[0] ?? ""}
          onChange={(event)=>change((draft)=>{
            draft.assertions[index].sourceDependencyIds=event.target.value ? [event.target.value]:[];})}>
          <option value="">None</option>{content.sourceDependencies.map((source)=><option
            key={source.id} value={source.id}>{label(source.kind)} · {source.sourceRevisionId}</option>)}
        </select></label>
        <label><input type="checkbox" checked={assertion.decisionCritical}
          onChange={(event)=>change((draft)=>{
            draft.assertions[index].decisionCritical=event.target.checked;})}/>
          Decision critical</label>
        {(["estimate","assumption"].includes(assertion.kind)) && <div className="plan-grid">
          <label>Owner role<input className="field" value={assertion.ownerRole ?? ""}
            onChange={(event)=>change((draft)=>{draft.assertions[index].ownerRole=event.target.value;})}/></label>
          <label>Validation action<input className="field" value={assertion.validationAction ?? ""}
            onChange={(event)=>change((draft)=>{draft.assertions[index].validationAction=event.target.value;})}/></label></div>}
      </fieldset>)}
      <button type="button" className="secondary-button" onClick={()=>change((draft)=>
        draft.assertions.push({key:`assertion_${draft.assertions.length+1}`,
          text:"Describe a scoped assertion",kind:"assumption",sourceDependencyIds:[],
          ownerRole:"Delivery owner",validationAction:"Validate with customer",
          decisionCritical:false}))}>Add assertion</button>
    </details>
    <details><summary>Technical Design</summary>
      {content.diagrams.map((diagram,index)=><fieldset key={diagram.key} className="profile-card">
        <legend>Diagram {index+1}</legend><label>Kind<select className="field" value={diagram.kind}
          onChange={(event)=>change((draft)=>{
            draft.diagrams[index].kind=event.target.value as typeof diagram.kind;})}>
          <option value="context">Context</option><option value="container">Container</option></select></label>
        <label>Text equivalent<textarea className="field" value={diagram.textEquivalent}
          onChange={(event)=>change((draft)=>{draft.diagrams[index].textEquivalent=event.target.value;})}/></label>
        {diagram.nodes.map((node,nodeIndex)=><div className="plan-inline" key={node.key}>
          <label>Node key<input className="field" value={node.key} onChange={(event)=>
            change((draft)=>{draft.diagrams[index].nodes[nodeIndex].key=event.target.value;})}/></label>
          <label>Label<input className="field" value={node.label} onChange={(event)=>
            change((draft)=>{draft.diagrams[index].nodes[nodeIndex].label=event.target.value;})}/></label></div>)}
        <button type="button" className="secondary-button" onClick={()=>change((draft)=>
          draft.diagrams[index].nodes.push({key:`node_${draft.diagrams[index].nodes.length+1}`,
            label:"Component"}))}>Add node</button>
        {diagram.edges.map((edge,edgeIndex)=><div className="plan-inline" key={edge.key}>
          <label>From<select className="field" value={edge.from} onChange={(event)=>change((draft)=>{
            draft.diagrams[index].edges[edgeIndex].from=event.target.value;})}>
            {diagram.nodes.map((node)=><option key={node.key} value={node.key}>{node.label}</option>)}
          </select></label><label>To<select className="field" value={edge.to}
            onChange={(event)=>change((draft)=>{
              draft.diagrams[index].edges[edgeIndex].to=event.target.value;})}>
            {diagram.nodes.map((node)=><option key={node.key} value={node.key}>{node.label}</option>)}
          </select></label><label>Connection<input className="field" value={edge.label}
            onChange={(event)=>change((draft)=>{
              draft.diagrams[index].edges[edgeIndex].label=event.target.value;})}/></label></div>)}
        <button type="button" className="secondary-button" onClick={()=>change((draft)=>{
          const selected=draft.diagrams[index];
          if (selected.nodes.length<2) return;
          selected.edges.push({key:`edge_${selected.edges.length+1}`,
            from:selected.nodes[0].key,to:selected.nodes[1].key,label:"Connection"});
        })}>Add connection</button>
        <PlanDiagram diagram={diagram}/>
      </fieldset>)}
      <button type="button" className="secondary-button" onClick={()=>change((draft)=>
        draft.diagrams.push({key:`diagram_${draft.diagrams.length+1}`,kind:"context",
          textEquivalent:"Describe the flow in words",nodes:[{key:"customer",label:"Customer"},
            {key:"service",label:"Service"}],edges:[]}))}>Add diagram</button>
      {content.designDecisions.map((decision,index)=><fieldset className="profile-card" key={decision.key}>
        <legend>Design Decision {index+1}</legend>
        {(["title","chosen","alternatives","rationale","testing","rollback","ownerRole"] as const)
          .map((field)=><label key={field}>{label(field)}<textarea className="field"
            value={decision[field]} onChange={(event)=>change((draft)=>{
              draft.designDecisions[index][field]=event.target.value;})}/></label>)}
      </fieldset>)}
      <button type="button" className="secondary-button" onClick={()=>change((draft)=>
        draft.designDecisions.push({key:`decision_${draft.designDecisions.length+1}`,
          title:"Design choice",chosen:"Describe chosen approach",
          alternatives:"Describe alternatives",rationale:"Explain choice",
          testing:"Describe checks",rollback:"Describe rollback",ownerRole:"Engineer"}))}>
        Add design decision</button>
    </details>
    <details><summary>Work and Milestones</summary>
      {content.workPackages.map((item,index)=><fieldset className="profile-card" key={item.key}>
        <legend>Work Package {index+1}</legend>
        {(["title","ownerRole","exitEvidence"] as const).map((field)=><label key={field}>
          {label(field)}<input className="field" value={item[field]}
            onChange={(event)=>change((draft)=>{draft.workPackages[index][field]=event.target.value;})}/>
        </label>)}<label>Track<select className="field" value={item.track}
          onChange={(event)=>change((draft)=>{
            draft.workPackages[index].track=event.target.value as typeof item.track;})}>
          <option value="value">Value</option><option value="production">Production</option>
          <option value="both">Both</option></select></label>
      </fieldset>)}
      <button type="button" className="secondary-button" onClick={()=>change((draft)=>
        draft.workPackages.push({key:`package_${draft.workPackages.length+1}`,title:"Work package",
          track:"value",ownerRole:"Delivery owner",exitEvidence:"Review evidence",
          effort:{state:"unknown",reason:"Estimate after discovery"}}))}>Add work package</button>
      {content.milestones.map((item,index)=><fieldset className="profile-card" key={item.key}>
        <legend>Milestone {index+1}</legend>
        {(["title","ownerRole","exitEvidence","customerValidation"] as const)
          .map((field)=><label key={field}>{label(field)}<input className="field"
            value={item[field]} onChange={(event)=>change((draft)=>{
              draft.milestones[index][field]=event.target.value;})}/></label>)}
        <label>Track<select className="field" value={item.track}
          onChange={(event)=>change((draft)=>{
            draft.milestones[index].track=event.target.value as typeof item.track;})}>
          <option value="value">Value</option><option value="production">Production</option>
          <option value="both">Both</option></select></label>
        <label>Planned date<input type="date" className="field" value={item.plannedDate ?? ""}
          onChange={(event)=>change((draft)=>{
            draft.milestones[index].plannedDate=event.target.value || null;
            draft.milestones[index].plannedDateUnknownReason=event.target.value ? undefined:
              "Schedule after discovery";})}/></label>
        {!item.plannedDate && <label>Unknown date reason<input className="field"
          value={item.plannedDateUnknownReason ?? ""} onChange={(event)=>change((draft)=>{
            draft.milestones[index].plannedDateUnknownReason=event.target.value;})}/></label>}
        <label>Predecessor milestone<select className="field" value={item.dependencies[0] ?? ""}
          onChange={(event)=>change((draft)=>{
            draft.milestones[index].dependencies=event.target.value ? [event.target.value]:[];})}>
          <option value="">None</option>{content.milestones.filter((other)=>other.key!==item.key)
            .map((other)=><option key={other.key} value={other.key}>{other.title}</option>)}
        </select></label>
      </fieldset>)}
      <button type="button" className="secondary-button" onClick={()=>change((draft)=>
        draft.milestones.push({key:`milestone_${draft.milestones.length+1}`,
          title:"Milestone",track:"value",ownerRole:"Delivery owner",
          exitEvidence:"Review evidence",customerValidation:"Customer reviews evidence",
          plannedDate:null,plannedDateUnknownReason:"Schedule after discovery",
          dependencies:[],effort:{state:"unknown",reason:"Estimate after discovery"}}))}>
        Add milestone</button>
    </details>
    <div className="plan-inline"><button type="button" onClick={()=>void save()}
      disabled={busy || !session || (!head && !profileReady)}>
      {busy ? "Working…":head ? "Save new revision":"Create draft"}</button>
      {head && !dirty && head.reviewState==="draft" && <button type="button"
        className="secondary-button" disabled={busy} onClick={()=>void submit()}>Submit for review</button>}
      {head && <Link href={`/customers/${customerId}/plans/${head.planId}`}>Plan Detail</Link>}</div>
  </section>;
}
