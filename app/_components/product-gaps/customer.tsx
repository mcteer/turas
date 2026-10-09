'use client';
import {useEffect,useState} from 'react';
export function GapCustomer({label,value,onChange}:{label:string;value:string;onChange:(id:string)=>void}){
 const [cursor,setCursor]=useState<string|null>(null),[items,setItems]=useState<Array<{id:string;displayName:string}>>([]),[next,setNext]=useState<string|null>(null),[status,setStatus]=useState('');
 useEffect(()=>{const c=new AbortController();setItems([]);void fetch(`/api/customers?${new URLSearchParams({limit:'50',...(cursor?{cursor}:{})})}`,{cache:'no-store',signal:c.signal}).then(async r=>{const b=await r.json();if(!r.ok)throw Error('Customers unavailable');setItems(b.data.items);setNext(b.data.nextCursor);}).catch(e=>{if(e.name!=='AbortError')setStatus('Customers unavailable');});return()=>c.abort();},[cursor]);
 return <div><label>{label}<select className="field" value={value} onChange={e=>onChange(e.target.value)}><option value="">Select a Customer</option>{items.map(c=><option key={c.id} value={c.id}>{c.displayName}</option>)}</select></label>{cursor&&<button className="secondary-button" type="button" onClick={()=>setCursor(null)}>First Customer Page</button>}{next&&<button className="secondary-button" type="button" onClick={()=>setCursor(next)}>More Customers</button>}{status&&<p role="status">{status}</p>}</div>;
}
