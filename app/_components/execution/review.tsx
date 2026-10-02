"use client";
import { useEffect,useRef,useState } from 'react';
import type {Candidate,Session} from './types';
export function ExecutionReview({engagementId,candidate,session,disabled,save,onClose}:{engagementId:string;candidate:Candidate;session:Session;disabled:boolean;save:(body:unknown)=>Promise<boolean>;onClose:()=>void}){
  const [preview,setPreview]=useState<{previewDigest:string;previewExpiresAt:string;expectedVersions:Record<string,number>}|null>(null),[rationale,setRationale]=useState(''),[message,setMessage]=useState('');const sequence=useRef(0),heading=useRef<HTMLHeadingElement|null>(null);
  useEffect(()=>{heading.current?.focus();},[candidate]);
  useEffect(()=>{const ticket=++sequence.current;setPreview(null);setMessage('');void fetch(`/api/execution/engagements/${engagementId}/preview`,{method:'POST',headers:{'content-type':'application/json','x-csrf-token':session.csrfToken},body:JSON.stringify(candidate)}).then(async response=>{const body=await response.json();if(ticket!==sequence.current)return;if(!response.ok||!body.data)throw new Error(body.error?.message??'Preview unavailable');setPreview(body.data);}).catch(error=>{if(ticket===sequence.current)setMessage(error instanceof Error?error.message:'Preview unavailable');});return()=>{++sequence.current;};},[candidate,engagementId,session.csrfToken]);
  useEffect(()=>{if(!preview)return;const timer=window.setTimeout(()=>{setPreview(null);setMessage('Preview expired. Close this review and inspect current inputs.');},Math.max(0,Date.parse(preview.previewExpiresAt)-Date.now()));return()=>window.clearTimeout(timer);},[preview]);
  return <section className="profile-section" aria-label="Exact execution review"><h2 ref={heading} tabIndex={-1}>Review exact execution inputs</h2>
    <p>Action: {candidate.action.replaceAll('.',' ').replaceAll('_',' ')}</p><p>The decision applies only to the displayed revision and current evidence. It does not approve customer maturity, staffing, or a new plan.</p>
    {message&&<p role="alert">{message}</p>}{!preview&&!message&&<p role="status">Checking current review inputs…</p>}
    {preview&&<><p>Preview expires {new Date(preview.previewExpiresAt).toLocaleTimeString()}.</p><p>Versions: {Object.entries(preview.expectedVersions).map(([name,value])=>`${name} ${value}`).join(' · ')}</p>
      <form onSubmit={event=>{event.preventDefault();void save({...candidate,...preview,rationale}).then(saved=>{if(saved)onClose();else{setPreview(null);setMessage('Decision is unconfirmed or inputs changed. Check the save status and current state before another review.');}});}}>
        <label>Review rationale<textarea required minLength={1} maxLength={2000} value={rationale} onChange={e=>setRationale(e.target.value)}/></label>
        <button type="submit" className="primary-button" disabled={disabled||!rationale.trim()}>Confirm reviewed decision</button>
      </form></>}
    <button type="button" className="secondary-button" onClick={onClose}>Close review</button>
  </section>;
}
