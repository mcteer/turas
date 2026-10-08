"use client";
import {useState} from 'react';
import type {z} from 'zod';
import type {expansionRelatedProjectionSchema} from '../../../lib/server/expansion/related';
export type ExpansionRelatedView=z.infer<typeof expansionRelatedProjectionSchema>;
export function ExpansionRelatedComparison({comparison,busy,onOpen,onSave,onCancel}:{comparison:ExpansionRelatedView;busy:boolean;onOpen:(id:string)=>void;onSave:(rationale:string)=>Promise<void>;onCancel:()=>void}){
 const [rationale,setRationale]=useState(''),[error,setError]=useState('');
 return <section className="profile-card" aria-labelledby="expansion-related-title"><h2 id="expansion-related-title">Related Hypotheses</h2><p>These records use the same product and problem identity. Review their disposition before creating a distinct proposal.</p>
 {comparison.records.map(record=><div key={record.id}><p>{record.title??'Related Hypothesis Content Unavailable'}</p><p>Related Disposition: {record.disposition[0].toUpperCase()+record.disposition.slice(1)}</p><button type="button" className="secondary-button" disabled={busy} onClick={()=>onOpen(record.id)}>Open Existing Hypothesis</button></div>)}
 <label htmlFor="expansion-distinction">Distinct Hypothesis Rationale</label><textarea id="expansion-distinction" className="field" value={rationale} maxLength={2000} disabled={busy} onChange={event=>setRationale(event.target.value)}/>
 {error&&<p role="alert">{error}</p>}
 <button className="primary-button" type="button" disabled={busy||!rationale.trim()} onClick={()=>{setError('');void onSave(rationale).catch(failure=>setError(failure instanceof Error?failure.message:'Save unavailable'));}}>Save Distinct Hypothesis as Proposed</button><button className="secondary-button" type="button" disabled={busy} onClick={onCancel}>Cancel Comparison</button></section>;
}
