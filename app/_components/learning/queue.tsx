'use client';
import Link from 'next/link';
import {useState} from 'react';
import type {listLearningCandidates} from '../../../lib/server/learning/reviews';
import {useLearningView} from './view';
import {titleCaseLabel} from '../title-case-label';
export function LearningCandidateQueue(){
 const [search,setSearch]=useState(''),[query,setQuery]=useState(''),[cursor,setCursor]=useState<string|null>(null);
 const client=useLearningView<Awaited<ReturnType<typeof listLearningCandidates>>>(`/api/learning/candidates?limit=20&search=${encodeURIComponent(query)}${cursor?`&cursor=${encodeURIComponent(cursor)}`:''}`);
 return <section className="profile-page"><Link href="/learning">Learning Feedback</Link><header className="profile-header"><div><h1>Learning Candidates</h1><p>Private proposals. Original evidence, reuse approval and evaluation remain separate.</p></div><button className="secondary-button" onClick={()=>void client.refresh()}>Refresh Candidates</button></header>
 {client.notice&&<p role="status">{client.notice}</p>}{client.loading&&<p role="status">Checking current access…</p>}
 <form className="profile-card" onSubmit={e=>{e.preventDefault();client.clear();setCursor(null);setQuery(search);}}><label>Search Candidate Titles<input className="field" maxLength={200} value={search} onChange={e=>setSearch(e.target.value)}/></label><button type="submit" className="secondary-button">Search Candidates</button></form>
 {client.view&&<><div className="profile-grid">{client.view.items.map(item=><article className="profile-card" key={item.id}><h2><Link href={`/learning/candidates/${item.id}`}>{item.title}</Link></h2><p>{titleCaseLabel(item.state)} · Revision {item.revision}</p></article>)}</div>{!client.view.items.length&&<p>No accessible candidates on this page.</p>}{cursor&&<button className="secondary-button" onClick={()=>{client.clear();setCursor(null);}}>First Candidate Page</button>}{client.view.cursor&&<button className="secondary-button" onClick={()=>{client.clear();setCursor(client.view!.cursor);}}>More Candidates</button>}</>}
 </section>;
}
