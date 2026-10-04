'use client';
import {useEffect,useRef,useState} from 'react';
import {reportGet} from './client';
type Brand={brandId:string;version:number;state:string;manifestDigest:string;fontDigest:string;templateDigest:string};
type Preview={previewId:string;previewDigest:string;expiresAt:string;brand:{samples:Array<{reportId:string;revisionId:string;kind:string}>;rendererImage:string;rendererCodeDigest:string}};
export function BrandReview({customerId,csrfToken,busy,onSave}:{customerId:string;csrfToken:string;busy:boolean;onSave:(url:string,input:Record<string,unknown>)=>Promise<unknown>}){
 const [brands,setBrands]=useState<Brand[]>([]),[allowed,setAllowed]=useState(false),[selected,setSelected]=useState<Brand|null>(null),[ids,setIds]=useState(['','','']),[review,setReview]=useState<Preview|null>(null),[rationale,setRationale]=useState(''),[message,setMessage]=useState(''),[epoch,setEpoch]=useState(0);
 const heading=useRef<HTMLHeadingElement|null>(null);
 useEffect(()=>{const controller=new AbortController();setReview(null);setBrands([]);setAllowed(false);
  reportGet<{brands:Brand[];canReview:boolean}>('/api/reports/brands',controller.signal).then(data=>{if(!controller.signal.aborted){setBrands(data.brands);setAllowed(data.canReview);}}).catch(()=>{});
  return()=>controller.abort();
 },[customerId,csrfToken,epoch]);
 useEffect(()=>{if(!review)return;heading.current?.focus();const timer=setTimeout(()=>{setReview(null);setMessage('Brand review expired. Open a fresh exact preview.');},Math.max(0,Date.parse(review.expiresAt)-Date.now()));return()=>clearTimeout(timer);},[review]);
 async function preview(event:React.FormEvent){event.preventDefault();if(!selected)return;setMessage('');
  const action=selected.state==='approved'?'revoke':'approve';
  try{const response=await fetch(`/api/reports/brands/${selected.brandId}/preview`,{method:'POST',headers:{'content-type':'application/json','x-csrf-token':csrfToken},body:JSON.stringify({customerId,action,expectedVersion:selected.version,sampleRevisionIds:action==='approve'?ids:[]})});const body=await response.json();if(!response.ok)throw new Error(body.error?.message??'Brand review unavailable');setReview(body.data);}
  catch(error){setMessage(error instanceof Error?error.message:'Brand review unavailable');}
 }
 async function decide(event:React.FormEvent){event.preventDefault();if(!selected||!review)return;const action=selected.state==='approved'?'revoke':'approve';
  const saved=await onSave(`/api/reports/brands/${selected.brandId}/decisions`,{customerId,action,expectedVersion:selected.version,sampleRevisionIds:action==='approve'?ids:[],previewId:review.previewId,previewDigest:review.previewDigest,rationale});
  if(saved){setReview(null);setSelected(null);setEpoch(current=>current+1);}
 }
 if(!allowed)return null;
 return <section className="profile-section"><h2>Report Brand Review</h2><p className="muted">Inspect actual weekly, monthly and quarterly samples before approving the exact assets, Geist fonts and authored master. This is not an official corporate slide master.</p>{message&&<p role="alert">{message}</p>}
  {brands.map(brand=><article className="profile-card" key={brand.brandId}><h3>Brand Version {brand.version} · {brand.state}</h3><dl><dt>Asset and Renderer Manifest</dt><dd><code>{brand.manifestDigest}</code></dd><dt>Fonts</dt><dd><code>{brand.fontDigest}</code></dd><dt>Template</dt><dd><code>{brand.templateDigest}</code></dd></dl>{brand.state!=='revoked'&&<button className="secondary-button" disabled={busy} onClick={()=>{setSelected(brand);setReview(null);setRationale('');}}>Review Brand {brand.state==='approved'?'Revocation':'Approval'}</button>}</article>)}
  {selected&&!review&&<form className="profile-card" onSubmit={preview}><h3>Choose Exact Brand Samples</h3>{selected.state==='draft'&&['Weekly','Monthly','Quarterly'].map((kind,index)=><label key={kind}>{kind} Sample Revision ID<input className="field" required value={ids[index]} onChange={event=>setIds(current=>current.map((value,i)=>i===index?event.target.value:value))}/></label>)}<button className="secondary-button" disabled={busy}>Open Exact Brand Preview</button></form>}
  {selected&&review&&<form className="profile-card" onSubmit={decide}><h3 ref={heading} tabIndex={-1}>Review Exact Brand</h3><p className="muted">Renderer {review.brand.rendererImage}. Editable presentations require approved Geist installed.</p><ul>{review.brand.samples.map(sample=><li key={sample.revisionId}><a href={`/customers/${customerId}/reports/${sample.reportId}?revisionId=${sample.revisionId}`}>{sample.kind} sample · {sample.revisionId}</a></li>)}</ul><label>Brand Decision Rationale<textarea className="field" required maxLength={2000} value={rationale} onChange={event=>setRationale(event.target.value)}/></label><div className="report-actions"><button className="primary-button" disabled={busy||!rationale.trim()}>Confirm Brand Decision</button><button type="button" className="secondary-button" onClick={()=>setReview(null)}>Cancel Brand Review</button></div></form>}
 </section>;
}
