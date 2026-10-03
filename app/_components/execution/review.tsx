"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {Candidate,Session} from "./types";
type Exception = {entryId:string;revisionId:string;codes:string[]};
type Preview = {previewDigest:string;previewExpiresAt:string;expectedVersions:Record<string,number>;exceptions?:Exception[]};
const labels:Record<string,string>={on_behalf:"On-behalf attribution",unplanned:"Unplanned work",over_capacity:"Work beyond capacity",
  unknown_capacity:"Unknown capacity and confirmed time zone",unavailable_source:"Unavailable source — numerical effort only",post_closeout:"Work after closeout"};
export function ExecutionReview({engagementId,candidate,session,disabled,save,onClose}:{engagementId:string;candidate:Candidate;session:Session;disabled:boolean;save:(body:unknown)=>Promise<boolean>;onClose:()=>void}){
  const [preview,setPreview]=useState<Preview|null>(null),[rationale,setRationale]=useState(""),[message,setMessage]=useState("");
  const [requirements,setRequirements]=useState<Exception[]>([]),[exceptions,setExceptions]=useState<Record<string,Record<string,string>>>({}),[changed,setChanged]=useState(false);
  const sequence=useRef(0),heading=useRef<HTMLHeadingElement|null>(null);
  const command=useMemo(()=>{const {display:_display,...body}=candidate;return body;},[candidate]);
  const body=useMemo(()=>{if(!candidate.action.startsWith("time."))return command;
    const payload=command.payload as {entries:Array<{entryId:string;exceptions:Record<string,string>}>};
    return {...command,payload:{entries:payload.entries.map(row=>({...row,exceptions:exceptions[row.entryId]??row.exceptions}))}};
  },[command,candidate.action,exceptions]);
  const load=useCallback(async(current:typeof command)=>{const ticket=++sequence.current;setPreview(null);setMessage("");try{
    const response=await fetch(`/api/execution/engagements/${engagementId}/preview`,{method:"POST",headers:{"content-type":"application/json","x-csrf-token":session.csrfToken},body:JSON.stringify(current)});
    const envelope=await response.json();if(ticket!==sequence.current)return;if(!response.ok||!envelope.data)throw new Error(envelope.error?.message??"Preview unavailable");
    setPreview(envelope.data);setRequirements(envelope.data.exceptions??[]);setChanged(false);
  }catch(error){if(ticket===sequence.current)setMessage(error instanceof Error?error.message:"Preview unavailable");}},[engagementId,session.csrfToken]);
  useEffect(()=>{heading.current?.focus();setExceptions({});setRequirements([]);setRationale("");setChanged(false);void load(command);return()=>{++sequence.current;};},[command,load]);
  useEffect(()=>{if(!preview)return;const timer=window.setTimeout(()=>{setPreview(null);setMessage("Preview expired. Close this review and inspect current inputs.");},Math.max(0,Date.parse(preview.previewExpiresAt)-Date.now()));return()=>window.clearTimeout(timer);},[preview]);
  const missing=requirements.some(row=>row.codes.some(code=>!exceptions[row.entryId]?.[code]?.trim()));
  return <section className="profile-section execution-review" aria-label="Exact execution review"><h2 ref={heading} tabIndex={-1}>Review Exact Execution Inputs</h2>
    <p>Action: {candidate.action.replaceAll("."," ").replaceAll("_"," ")}</p>
    {candidate.display?.map((row,i)=><article className="profile-card" key={i}><h3>{row.title}</h3><p>{row.detail}</p></article>)}
    <p>The decision applies to these exact revisions and their current evidence.</p>
    {message&&<p role="alert">{message}</p>}{!preview&&!message&&<p role="status">Checking current review inputs…</p>}
    {requirements.filter(r=>r.codes.length>0).map((row,i)=><fieldset key={row.entryId}><legend>Entry {i+1}: Required Exceptions</legend>{row.codes.map(code=><label key={code}>{labels[code]??code}<textarea className="field" required maxLength={2000}
      value={exceptions[row.entryId]?.[code]??""} onChange={e=>{const text=e.target.value;setExceptions(current=>({...current,[row.entryId]:{...current[row.entryId],[code]:text}}));setChanged(true);}}/></label>)}</fieldset>)}
    {changed&&<button type="button" className="secondary-button" disabled={disabled||missing} onClick={()=>void load(body)}>Review updated exceptions</button>}
    {preview&&<><p>Preview expires {new Date(preview.previewExpiresAt).toLocaleTimeString()}.</p><p className="muted">Versions: {Object.entries(preview.expectedVersions).map(([name,value])=>`${name} ${value}`).join(" · ")}</p>
      <form onSubmit={event=>{event.preventDefault();void save({...body,previewDigest:preview.previewDigest,previewExpiresAt:preview.previewExpiresAt,rationale}).then(saved=>{if(saved)onClose();else{setPreview(null);setMessage("Decision is unconfirmed or inputs changed. Check the save status and current state before another review.");}});}}>
        <label>Review rationale<textarea className="field" required minLength={1} maxLength={2000} value={rationale} onChange={e=>setRationale(e.target.value)}/></label>
        <button type="submit" className="primary-button" disabled={disabled||changed||missing||!rationale.trim()}>Confirm reviewed decision</button>
      </form></>}
    <button type="button" className="secondary-button" onClick={onClose}>Close review</button>
  </section>;
}
