import Link from 'next/link';
import type {GapContent,GapImpactContent} from '../../../lib/contracts/product-gaps';
import type {GapRevisionProjection} from '../../../lib/server/gaps/projection';
const label=(key:string)=>key.replace(/([A-Z])/g,' $1').replace(/^./,s=>s.toUpperCase());
export function GapNarrative({revision,heading}:{revision:GapRevisionProjection|null;heading:string}){
 if(!revision)return <section className="profile-section"><h2>{heading}</h2><p>No reviewed revision yet.</p></section>;
 if(!revision.content)return <section className="profile-section"><h2>{heading}</h2><p>Content {revision.availability}. Current eligible originals are required.</p></section>;
 const content=revision.content as GapContent|GapImpactContent;
 return <section className="profile-section"><h2>{heading}</h2>{Object.entries(content).map(([key,value])=>key==='assertions'?<div key={key}><h3>Assertions</h3>{(value as GapImpactContent['assertions']).map((a,i)=><p key={i}>{a.text} · {a.classification.replaceAll('_',' ')} · {a.sourceKeys.length} selected originals</p>)}</div>:<div className="report-block" key={key}><h3>{label(key)}</h3><p>{Array.isArray(value)?value.join('\n'):value===null?'Unknown':String(value)}</p></div>)}<h3>Exact Original Sources</h3>{revision.sourceRefs.length?<ul>{revision.sourceRefs.map(ref=><li key={ref.id}>{ref.kind.replaceAll('_',' ')} · {ref.purpose.replaceAll('_',' ')}{ref.customerId&&<> · <Link href={`/customers/${ref.customerId}`}>Customer Profile</Link></>}<details><summary>Original Citation Identity</summary><p>Revision {ref.sourceRevisionId}, generation {ref.generation}</p>{ref.locator&&<pre className="report-mail-text">{JSON.stringify(ref.locator,null,2)}</pre>}</details></li>)}</ul>:<p>No originals attached. Customer impact is not established by this narrative.</p>}</section>;
}
