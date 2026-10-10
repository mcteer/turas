'use client';
import { useEffect,useRef,useState } from 'react';
import type { McpCategory } from '../../../lib/contracts/mcp';
import type { createMcpConnection,listMcpConnections,listMcpUsage,reconcileMcpRequest } from '../../../lib/server/mcp/management';
type Listing=Awaited<ReturnType<typeof listMcpConnections>>;
type Connection=Listing['connections'][number]['connection'];
type Auth={csrfToken:string;principal:{loginName:string};membership:{kind:string;role:string}};
type Customer={id:string;displayName:string};
class ConnectionRequestFailure extends Error{constructor(message:string,readonly status:number){super(message);}}
async function read<T>(url:string,init?:RequestInit):Promise<T>{
  const response=await fetch(url,{cache:'no-store',...init});
  const body=await response.json() as {data?:T;error?:{message?:string}};
  if(!response.ok || body.data===undefined)throw new ConnectionRequestFailure(body.error?.message??'Connections are unavailable',response.status);return body.data;
}
const categoryLabels:Record<McpCategory,string>={profiles:'Profiles',evidence:'Evidence',knowledge:'Shared Knowledge',plans:'Accepted Plans',reports:'Published Reports'};
export function Connections(){
  const [auth,setAuth]=useState<Auth|null>(null),[listing,setListing]=useState<Listing|null>(null),[adminListing,setAdminListing]=useState<Listing|null>(null);
  const [customers,setCustomers]=useState<Customer[]>([]),[customerCursor,setCustomerCursor]=useState<string|null>(null),[listCursor,setListCursor]=useState<string|null>(null),[adminCursor,setAdminCursor]=useState<string|null>(null);
  const [customerLabels,setCustomerLabels]=useState<Record<string,string>>({}),[copyNotice,setCopyNotice]=useState('');
  const [name,setName]=useState(''),[categories,setCategories]=useState<McpCategory[]>([]),[selected,setSelected]=useState<string[]>([]),[days,setDays]=useState(7),[reviewed,setReviewed]=useState(false);
  const [notice,setNotice]=useState(''),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
  const [credential,setCredential]=useState<string|null>(null),[revoke,setRevoke]=useState<Connection|null>(null),[usage,setUsage]=useState<Awaited<ReturnType<typeof listMcpUsage>>|null>(null);
  const [pending,setPending]=useState<{key:string;action:'create'|'revoke';name:string}|null>(null);
  const [usageId,setUsageId]=useState<string|null>(null);
  const dialog=useRef<HTMLDialogElement>(null),opener=useRef<HTMLElement|null>(null),inFlight=useRef(false);
  const admin=auth?.principal.loginName==='mcteer'&&auth.membership.kind==='internal'&&auth.membership.role==='admin';
  async function refresh(cursor:string|null=listCursor){
    try{setLoading(true);setListing(await read<Listing>('/api/mcp/connections?limit=20'+(cursor?'&cursor='+encodeURIComponent(cursor):'')));setNotice('');}
    catch{setListing(null);setNotice('Connections are unavailable. Refresh to check current access.');}finally{setLoading(false);}
  }
  async function loadCustomers(cursor:string|null=null){
    try{const result=await read<{items:Customer[];nextCursor:string|null}>('/api/customers?limit=50'+(cursor?'&cursor='+encodeURIComponent(cursor):''));
      setCustomers(result.items);setCustomerCursor(result.nextCursor);setCustomerLabels(previous=>({...(!cursor?{}:previous),...Object.fromEntries(result.items.map(item=>[item.id,item.displayName]))}));if(!cursor){setSelected([]);setReviewed(false);}
    }catch{setCustomers([]);setSelected([]);setCustomerCursor(null);setNotice('Customer scope is unavailable. Refresh before selecting customers.');}
  }
  useEffect(()=>{let alive=true;void read<Auth>('/api/auth/session').then(value=>{if(alive)setAuth(value);}).catch(()=>{if(alive)setNotice('Sign in to manage connections.');});void refresh(null);void loadCustomers();return()=>{alive=false;};},[]);
  useEffect(()=>{if(credential||revoke)dialog.current?.showModal();else dialog.current?.close();},[credential,revoke]);
  function closeDialog(){dialog.current?.close();setCredential(null);setRevoke(null);setCopyNotice('');opener.current?.focus();}
  async function post<T>(url:string,input:unknown){if(!auth)throw Error('Sign in required');return read<T>(url,{method:'POST',headers:{'content-type':'application/json','x-csrf-token':auth.csrfToken},body:JSON.stringify(input)});}
  async function create(event:React.FormEvent){
    event.preventDefault();if(inFlight.current || pending || !reviewed)return;inFlight.current=true;setBusy(true);setNotice('');
    const key=crypto.randomUUID();setPending({key,action:'create',name});opener.current=document.activeElement as HTMLElement;
    try{const result=await post<Awaited<ReturnType<typeof createMcpConnection>>>('/api/mcp/connections',{requestKey:key,name,categories,customerIds:selected,lifetimeDays:days});
      setPending(null);setName('');setCategories([]);setSelected([]);setReviewed(false);
      if(result.secretAvailable){setCopyNotice('');setCredential(result.credential);}else setNotice('This connection was already created. Its credential cannot be recovered; revoke it before creating a replacement.');
      setListCursor(null);await refresh(null);
    }catch(error){if(error instanceof ConnectionRequestFailure && error.status>=400&&error.status<500){setPending(null);setNotice(error.message);}else setNotice('Creation is unconfirmed. Check the request below before taking another action.');}
    finally{inFlight.current=false;setBusy(false);}
  }
  async function confirmRevoke(){
    if(!revoke || inFlight.current)return;inFlight.current=true;setBusy(true);const target=revoke,key=crypto.randomUUID();
    setPending({key,action:'revoke',name:target.name});
    try{await post(`/api/mcp/connections/${target.id}/revoke`,{requestKey:key,expectedConnectionId:target.id});setPending(null);closeDialog();await refresh();setAdminListing(null);setNotice('Connection revoked. Future reads are denied.');}
    catch{closeDialog();setNotice('Revocation is unconfirmed. Check its request status below.');}finally{inFlight.current=false;setBusy(false);}
  }
  async function reconcile(){
    if(!pending)return;setBusy(true);
    try{const result=await read<Awaited<ReturnType<typeof reconcileMcpRequest>>>('/api/mcp/connections/requests/'+pending.key);
      if(result.confirmed){setPending(null);await refresh(null);setListCursor(null);setNotice(pending.action==='create'?'Creation confirmed. The credential was not recovered. Revoke this connection before creating a replacement.':'Revocation confirmed. Future reads are denied.');}
      else setNotice('No completed receipt yet. The request remains unconfirmed; check again.');
    }catch{setNotice('Request status is unavailable. No action was retried.');}finally{setBusy(false);}
  }
  async function adminPage(cursor:string|null=null){try{setAdminListing(await read<Listing>('/api/mcp/connections/admin?limit=20'+(cursor?'&cursor='+encodeURIComponent(cursor):'')));setAdminCursor(cursor);}catch{setAdminListing(null);setNotice('Workspace access is unavailable.');}}
  function cards(value:Listing){return value.connections.length?<div className="profile-grid">{value.connections.map(item=><article className="profile-card" key={item.connection.id}>
    <h3>{item.connection.name}</h3><p>{item.connection.state==='active'?'Active':item.connection.state==='expired'?'Expired':'Revoked'} · Expires {new Date(item.connection.expiresAt).toLocaleString()}</p>
    <p>{item.connection.categories.map(category=>categoryLabels[category]).join(' · ')}</p>
    <p>{item.customers.length?item.customers.map(customer=>customer.displayName).join(', '):'No currently visible customer scope'}</p>
    <div className="profile-actions"><button type="button" className="secondary-button" disabled={busy||!!pending||item.connection.state==='revoked'} onClick={e=>{opener.current=e.currentTarget;setRevoke(item.connection);}}>Revoke {item.connection.name}</button>
    <button type="button" className="secondary-button" onClick={()=>{setUsageId(item.connection.id);void read<Awaited<ReturnType<typeof listMcpUsage>>>(`/api/mcp/connections/${item.connection.id}/usage?limit=20`).then(setUsage).catch(()=>setNotice('Usage is unavailable.'));}}>View Usage for {item.connection.name}</button></div>
  </article>)}</div>:<div className="profile-state"><h3>No Connections</h3><p>Create access for an external assistant when you are ready.</p></div>;}
  return <section className="profile-page mcp-connections"><header className="profile-header"><div><h1>Connections</h1><p>Give an external assistant expiring, read-only access within your current Turas permissions.</p></div><button type="button" className="secondary-button" disabled={busy} onClick={()=>{void refresh();void loadCustomers();}}>Refresh Connections</button></header>
    {loading&&<p role="status">Checking current access…</p>}{notice&&<p role="status">{notice}</p>}
    {pending&&<section className="profile-card"><h2>Unconfirmed Request</h2><p>{pending.action==='create'?'Create':'Revoke'}: {pending.name}. No action is retried automatically.</p><button type="button" className="secondary-button" disabled={busy} onClick={()=>void reconcile()}>Check Request Status</button></section>}
    {listing&&<><section><h2>My Connections</h2>{cards(listing)}{listCursor&&<button className="secondary-button" type="button" onClick={()=>{setListCursor(null);void refresh(null);}}>First Connection Page</button>}{listing.nextCursor&&<button className="secondary-button" type="button" onClick={()=>{setListCursor(listing.nextCursor);void refresh(listing.nextCursor);}}>More Connections</button>}</section>
    {listing.serviceState==='disabled'?<p role="status">New connections and external reads are disabled. You can still revoke existing access.</p>:<form className="profile-card mcp-form" onSubmit={create}><h2>Create Connection</h2>
      <label>Connection Name<input className="field" required maxLength={80} value={name} disabled={busy||!!pending} onChange={e=>setName(e.target.value)}/></label>
      <fieldset><legend>Allowed Content</legend>{(Object.keys(categoryLabels) as McpCategory[]).map(category=><label key={category}><input type="checkbox" checked={categories.includes(category)} disabled={busy||!!pending} onChange={e=>{setCategories(values=>e.target.checked?[...values,category]:values.filter(value=>value!==category));setReviewed(false);}}/> {categoryLabels[category]}</label>)}</fieldset>
      <fieldset><legend>Selected Customers</legend>{customers.length?customers.map(customer=><label key={customer.id}><input type="checkbox" checked={selected.includes(customer.id)} disabled={busy||!!pending||(!selected.includes(customer.id)&&selected.length>=100)} onChange={e=>{setSelected(values=>e.target.checked?[...values,customer.id]:values.filter(value=>value!==customer.id));setReviewed(false);}}/> {customer.displayName}</label>):<p>No customers currently available on this page. Shared Knowledge can be selected without customers.</p>}
      {customerCursor&&<button type="button" className="secondary-button" disabled={busy} onClick={()=>void loadCustomers(customerCursor)}>More Available Customers</button>}<button type="button" className="secondary-button" disabled={busy} onClick={()=>void loadCustomers()}>Refresh Customer Scope</button></fieldset>
      <label>Expires in Days<input className="field" type="number" min={1} max={30} required value={days} disabled={busy||!!pending} onChange={e=>{setDays(Number(e.target.value));setReviewed(false);}}/></label>
      <p>{categories.map(category=>categoryLabels[category]).join(' · ')||'No content selected'} · {days} days</p><p>Selected scope: {selected.length?selected.map(id=>customerLabels[id]??'Unavailable customer').join(', '):'No customers'}</p>
      <label><input type="checkbox" checked={reviewed} disabled={busy||!!pending} onChange={e=>setReviewed(e.target.checked)}/> I reviewed this scope and expiration.</label>
      <p>The credential appears once. Clients must support manual Authorization headers.</p><button type="submit" className="primary-button" disabled={busy||!!pending||!auth||!reviewed||!categories.length||(categories.some(category=>category!=='knowledge')&&!selected.length)}>Create Connection</button>
    </form>}</>}
    {admin&&<section className="profile-card"><h2>Workspace Access</h2><p>Review and revoke workspace connections.</p><button type="button" className="secondary-button" onClick={()=>void adminPage()}>Review Workspace Connections</button>{adminListing&&<>{cards(adminListing)}{adminCursor&&<button type="button" className="secondary-button" onClick={()=>void adminPage()}>First Workspace Page</button>}{adminListing.nextCursor&&<button type="button" className="secondary-button" onClick={()=>void adminPage(adminListing.nextCursor)}>More Workspace Connections</button>}</>}</section>}
    {usage&&<section className="profile-card"><h2>Connection Usage</h2>{usage.items.length?usage.items.map(item=><p key={item.requestId}>{item.operation} · {item.result} · {new Date(item.createdAt).toLocaleString()} · {item.durationMs} ms</p>):<p>No recent usage receipts.</p>}{usage.nextCursor&&usageId&&<button type="button" className="secondary-button" onClick={()=>{void read<Awaited<ReturnType<typeof listMcpUsage>>>(`/api/mcp/connections/${usageId}/usage?limit=20&cursor=${encodeURIComponent(usage.nextCursor!)}`).then(setUsage).catch(()=>setNotice('Usage is unavailable.'));}}>Next Usage Page</button>}<button type="button" className="secondary-button" onClick={()=>setUsage(null)}>Close Usage</button></section>}
    <dialog className="mcp-dialog" ref={dialog} aria-labelledby="connection-dialog-title" onCancel={event=>{event.preventDefault();if(!busy)closeDialog();}}>
      {credential?<><h2 id="connection-dialog-title">One-Time Credential</h2><p>Your credential is ready to copy. It stays only in this page&apos;s memory.</p><p>You cannot retrieve it after dismissal. If copying fails, revoke this connection and create a replacement.</p>
        {copyNotice&&<p role="status">{copyNotice}</p>}<button type="button" className="primary-button" onClick={()=>{if(!navigator.clipboard){setCopyNotice('Copy is unavailable. Revoke this connection if you cannot save its credential.');return;}void navigator.clipboard.writeText(credential).then(()=>setCopyNotice('Credential copied.')).catch(()=>setCopyNotice('Copy failed. The credential remains available until dismissal.'));}}>Copy Credential</button>
        <button type="button" className="secondary-button" onClick={closeDialog}>Dismiss and Discard Credential</button></>:revoke?<><h2 id="connection-dialog-title">Revoke Connection</h2><p>Revoke {revoke.name}? Future external reads will be denied. Already delivered content cannot be recalled.</p><button type="button" className="primary-button" disabled={busy} onClick={()=>void confirmRevoke()}>Confirm Revocation</button><button type="button" className="secondary-button" disabled={busy} onClick={closeDialog}>Cancel</button></>:null}
    </dialog>
  </section>;
}
