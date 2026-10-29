import {createHash,randomUUID} from 'node:crypto';
import type {Client} from 'pg';
import {z} from 'zod';
import type {PilotHostedScope} from '../lib/contracts/pilot-hosted';
import {pilotHostedRequest} from './pilot-hosted-request';

/** Parked conversations exercise normal ownership and lifecycle APIs without
 * submitting a message, binding eve, or admitting any provider work. They are
 * archived even after a damaged response or parent cancellation. */
export async function runHostedConversationBoundary(input:{scope:PilotHostedScope;db:Client;headers:Headers;customerId:string;signal:AbortSignal;transport?:typeof fetch;foreignConversationIds?:readonly string[]}){
 const {scope,db,headers,signal,customerId}=input,transport=input.transport??fetch;
 const customer=z.uuid().parse(customerId),foreign=z.array(z.uuid()).max(20).parse(input.foreignConversationIds??[]);
 const cookie=headers.get('cookie')??'',token=/(?:^|;\s*)(?:__Host-)?turas_session=([A-Za-z0-9_-]{43})(?:;|$)/.exec(cookie)?.[1];
 if(!token)throw Error('Exact pilot conversation session required');
 const actor=(await db.query(`SELECT s.principal_id,s.membership_id FROM login_sessions s
  JOIN memberships m ON m.id=s.membership_id AND m.principal_id=s.principal_id AND m.workspace_id=s.workspace_id AND m.active
  JOIN principals p ON p.id=s.principal_id AND p.active
  JOIN workspaces w ON w.id=s.workspace_id AND w.active AND w.classification='synthetic_pilot' AND w.pilot_environment_id=$3
  JOIN customer_references c ON c.workspace_id=w.id AND c.id=$4 AND c.synthetic
  WHERE s.token_hash=$1 AND s.workspace_id=$2 AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp()`,[createHash('sha256').update(token).digest('hex'),scope.workspaceId,scope.environmentMarker,customer])).rows[0];
 if(!actor)throw Error('Exact active synthetic conversation scope required');
 if(foreign.length){
  const rows=(await db.query(`SELECT id FROM conversations WHERE id=ANY($1::uuid[]) AND workspace_id=$2 AND environment_id=$3 AND owner_principal_id<>$4 AND customer_id=$5`,[foreign,scope.workspaceId,scope.environmentMarker,actor.principal_id,customer])).rows;
  if(new Set(foreign).size!==foreign.length||rows.length!==foreign.length)throw Error('Exact foreign-owner pilot conversations required');
 }
 const request=pilotHostedRequest({scope,headers,signal,transport}),requestKey=randomUUID();
 const title='Synthetic parked pilot '+scope.runId;
 const reference=z.object({data:z.object({id:z.uuid(),customerId:z.uuid(),ownerPrincipalId:z.uuid(),title:z.literal(title),bindingState:z.literal('unbound'),eveSessionId:z.null()})});
 const cases:string[]=[];let conversationId:string|undefined,commands=0,archived=false;
 async function state(id:string){return (await db.query(`SELECT id,customer_id,owner_principal_id,binding_state,eve_session_id,archived_at FROM conversations
  WHERE id=$1 AND workspace_id=$2 AND environment_id=$3 AND creation_operation_id=$4`,[id,scope.workspaceId,scope.environmentMarker,requestKey])).rows[0];}
 async function archive(id:string,value:boolean,cleanup=false){
  const call=cleanup?pilotHostedRequest({scope,headers,signal:AbortSignal.timeout(5000),transport}):request;
  const result=z.object({data:z.object({id:z.uuid(),archived:z.boolean()})}).parse(await call('/api/conversations/'+id,'PATCH',{archived:value})).data;
  commands++;const row=await state(id);
  if(result.id!==id||result.archived!==value||!row||Boolean(row.archived_at)!==value)throw Error('Exact conversation archive state differs');
 }
 try{
  const body={customerId:customer,requestKey,title};
  const created=reference.parse(await request('/api/conversations','POST',body)).data;commands++;conversationId=created.id;
  const row=await state(created.id);
  if(created.customerId!==customer||created.ownerPrincipalId!==actor.principal_id||!row||row.customer_id!==customer||row.owner_principal_id!==actor.principal_id||row.binding_state!=='unbound'||row.eve_session_id!==null||row.archived_at!==null)throw Error('Persisted parked conversation identity differs');
  cases.push('owned-parked-conversation');
  const replay=reference.parse(await request('/api/conversations','POST',body)).data;commands++;
  if(replay.id!==created.id||(await db.query('SELECT count(*)::int AS n FROM conversations WHERE creation_operation_id=$1',[requestKey])).rows[0].n!==1)throw Error('Original conversation request replay differs');
  cases.push('original-key-replay');
  const detail=z.object({data:z.object({id:z.uuid(),ownerPrincipalId:z.uuid(),bindingState:z.literal('unbound'),eveSessionId:z.null(),history:z.array(z.unknown()).length(0),attempts:z.array(z.unknown()).length(0),submittedMessages:z.array(z.unknown()).length(0)})}).parse(await request('/api/conversations/'+created.id,'GET')).data;
  if(detail.id!==created.id||detail.ownerPrincipalId!==actor.principal_id)throw Error('Owned conversation read differs');cases.push('no-native-or-model-dispatch');
  for(const id of foreign){
   for(const method of ['GET','PATCH'] as const){
    signal.throwIfAborted();
    const response=await transport(new URL('/api/conversations/'+id,scope.origin),{method,headers,body:method==='PATCH'?JSON.stringify({archived:true}):undefined,redirect:'manual',cache:'no-store',signal:AbortSignal.any([signal,AbortSignal.timeout(10000)])});
    // A denied response must carry the same release binding; never retain or
    // parse an accidentally disclosed foreign-owner conversation payload.
    await response.body?.cancel();
    if(response.status!==404||response.headers.get('x-turas-code-version')!==scope.sourceCommit)throw Error('Foreign-owner conversation was not withheld');
   }
   cases.push('foreign-owner-read-and-write-denied');
  }
  await archive(created.id,true);cases.push('archive-persisted');
  await archive(created.id,false);cases.push('restore-persisted');
 }finally{
  // Reconcile the original creation key after an uncertain POST response. No
  // replacement create, native session, owner SQL mutation or provider call.
  const rows=(await db.query(`SELECT id FROM conversations WHERE creation_operation_id=$1 AND workspace_id=$2 AND environment_id=$3 AND owner_principal_id=$4 AND customer_id=$5 AND title=$6 AND binding_state='unbound' AND eve_session_id IS NULL`,[requestKey,scope.workspaceId,scope.environmentMarker,actor.principal_id,customer,title])).rows;
  if(rows.length>1)throw Error('Conversation cleanup identity is ambiguous');
  if(rows.length){conversationId=String(rows[0].id);await archive(conversationId,true,true);archived=true;}
 }
 if(!conversationId||!archived)throw Error('Exact parked conversation cleanup unverified');
 cases.push('exact-conversation-archived');
 return {contract:'pilot-hosted-conversation-boundary-v1',journey:'J002',conversationId,cases:cases.map(id=>({id,state:'pass' as const})),passedCases:cases.length,normalCommands:commands,foreignOwnerDenials:foreign.length,parkedOnly:true,providerCalls:0,streamResumeStopVerified:false,fullHostedCatalogVerified:false};
}
