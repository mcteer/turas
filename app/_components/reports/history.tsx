'use client';
import {useEffect,useState} from 'react';
import {reportGet} from './client';
type Entry={revisionId:string;revisionNumber:number;asOf:string;publicationId:string|null;correctionOf:string|null;visibility:string;state:string;comparison?:{available:boolean;changedSections?:string[];changedMeasures?:string[];annotationsChanged?:boolean;reason?:string}|null};
export function ReportHistory({reportId,version}:{reportId:string;version:number}){
 const [entries,setEntries]=useState<Entry[]>([]),[error,setError]=useState('');
 useEffect(()=>{const controller=new AbortController();setEntries([]);setError('');
  reportGet<{revisions:Entry[]}>(`/api/reports/${reportId}/history`,controller.signal).then(result=>setEntries(result.revisions)).catch(()=>{if(!controller.signal.aborted)setError('Report history is unavailable');});
  return()=>controller.abort();
 },[reportId,version]);
 return <section className="profile-card"><h2>Revision and Correction History</h2>{error?<p role="status">{error}</p>:entries.length?<ol>{entries.map(entry=><li key={entry.revisionId}>Revision {entry.revisionNumber} · {entry.publicationId?'Published':'Draft'} · {entry.visibility.replaceAll('_',' ')}{entry.correctionOf?' · Corrects an earlier publication':''}<span className="muted"> · Captured {new Date(entry.asOf).toLocaleString()}</span>{entry.comparison&&<p className="muted">{entry.comparison.available?`Changed sections: ${entry.comparison.changedSections?.join(', ')||'none'}. Changed measures: ${entry.comparison.changedMeasures?.join(', ')||'none'}.${entry.comparison.annotationsChanged?' Reviewer annotations changed.':''}`:entry.comparison.reason}</p>}</li>)}</ol>:<p className="muted">No visible report history available.</p>}<p className="muted">Corrections require fresh review and send approval. Turas cannot recall copies already sent or downloaded.</p></section>;
}
