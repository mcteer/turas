import {assertRestoredNamedContentSafety,reconcileRestoredNamedContentSafety} from '../../../lib/server/operations/recovery-named-content';
import {it,expect} from 'vitest';
import {recoveryDigest} from '../../../lib/contracts/pilot-recovery';
import {connectionMetadata} from '../../../lib/server/mcp/management';
import {randomUUID} from 'node:crypto';
it('hashes identical recovery inventories independently of object property order',async()=>{
 expect(recoveryDigest([{key:'owned/object',sizeBytes:10,digest:'a'.repeat(64)}])).toBe(recoveryDigest([{digest:'a'.repeat(64),key:'owned/object',sizeBytes:10}]));
 expect(recoveryDigest({nested:{a:1,b:2}})).toBe(recoveryDigest({nested:{b:2,a:1}}));
 expect(recoveryDigest([{id:1},{id:2}])).not.toBe(recoveryDigest([{id:2},{id:1}]));
 // Current complete coverage needs exact authenticated names; legacy gaps never
 // become complete merely because a restored array/table is empty.
 const conversationId=randomUUID(),attemptId=randomUUID(),citation='public_practice:'+'a'.repeat(64),at='2026-10-29T12:00:00.000Z';
 const dependency={conversation_id:conversationId,scope_key:'workspace',citation_id:citation,customer_id:null,first_attempt_id:attemptId,consumed_at:at};
 const snapshot=(schemaVersion:number,coverage='complete',rows=[dependency])=>({schemaVersion,tables:[{name:'ordinary_named_content_coverage',rows:[{identity:{conversation_id:conversationId},status:{coverage,recorded_at:at}}]},{name:'ordinary_named_content_dependencies',rows:rows.map(d=>({identity:{conversation_id:d.conversation_id,scope_key:d.scope_key,citation_id:d.citation_id},status:d}))}]} as any);
 const db=(coverage:string|null,rows:unknown[]=[])=>({query:async(sql:string)=>{expect(sql.trim().startsWith('SELECT')).toBe(true);return {rows:sql.includes('SELECT h.conversation_id')?(coverage?[{conversation_id:conversationId,coverage,recorded_at:at}]:[]):rows};}} as any);
 expect(await assertRestoredNamedContentSafety(db('legacy_gap'),snapshot(79),'synthetic')).toMatchObject({completeConversations:0,legacyGapConversations:1,authorityGranted:false});
 await expect(assertRestoredNamedContentSafety(db('complete'),snapshot(79),'synthetic')).rejects.toThrow('Historical snapshot');
 expect(await assertRestoredNamedContentSafety(db('complete',[dependency]),snapshot(80),'synthetic')).toMatchObject({completeConversations:1,activeNamedContentVerified:true,authorityGranted:false});
 await expect(assertRestoredNamedContentSafety(db('complete',[]),snapshot(80),'synthetic')).rejects.toThrow('incomplete');
 await expect(assertRestoredNamedContentSafety(db('complete',[dependency]),snapshot(80,'legacy_gap'),'synthetic')).rejects.toThrow('cannot exceed');
 for(const patch of [{citation_id:'different'},{first_attempt_id:randomUUID()},{customer_id:randomUUID()},{consumed_at:'2026-10-29T12:00:01.000Z'},{consumed_at:'2026-10-29T12:00:00.000001Z'}])await expect(assertRestoredNamedContentSafety(db('complete',[{...dependency,...patch}]),snapshot(80),'synthetic')).rejects.toThrow('dependency differs');

 const ownerDb=(initial:Record<string,any>[],owner=true)=>{const stored=initial.map(r=>({...r})),writes:string[]=[];return {stored,writes,client:{query:async(sql:string,args?:unknown[])=>{
  if(sql.startsWith('SAVEPOINT')||sql.startsWith('RELEASE SAVEPOINT'))return {rows:[]};
  if(sql.includes('AS owner FROM pg_class'))return {rows:[{owner}]};
  if(sql.includes('SELECT h.conversation_id'))return {rows:[{conversation_id:conversationId,coverage:'complete',recorded_at:at}]};
  if(sql.includes('SELECT d.conversation_id'))return {rows:stored};
  expect(sql.trim().startsWith('INSERT INTO ordinary_named_content_dependencies')).toBe(true);expect(sql).not.toMatch(/UPDATE|DELETE/);writes.push(sql);
  const appended=JSON.parse(String(args![0])).map((r:Record<string,unknown>)=>({...r,scope_key:r.customer_id??'workspace'}));stored.push(...appended);return {rows:[],rowCount:appended.length};
 }} as any};};
 const restored=ownerDb([]);expect(await reconcileRestoredNamedContentSafety(restored.client,snapshot(80),'synthetic')).toMatchObject({authenticatedDependencyMetadataAppended:1,completeConversations:1,authorityGranted:false});expect(restored.stored).toEqual([dependency]);
 expect(await reconcileRestoredNamedContentSafety(restored.client,snapshot(80),'synthetic')).toMatchObject({authenticatedDependencyMetadataAppended:0});expect(restored.writes).toHaveLength(1);
 const conflict=ownerDb([{...dependency,first_attempt_id:randomUUID()}]);await expect(reconcileRestoredNamedContentSafety(conflict.client,snapshot(80),'synthetic')).rejects.toThrow('conflicts');expect(conflict.writes).toHaveLength(0);
 const foreign=ownerDb([],false);await expect(reconcileRestoredNamedContentSafety(foreign.client,snapshot(80),'synthetic')).rejects.toThrow('actual recovery owner');expect(foreign.writes).toHaveLength(0);
 const historical=ownerDb([]);await expect(reconcileRestoredNamedContentSafety(historical.client,snapshot(79),'synthetic')).rejects.toThrow('Historical snapshot');expect(historical.writes).toHaveLength(0);

});
it('reports permanently removed MCP credentials as revoked without inventing a human revoker',()=>{
 const row={id:randomUUID(),name:'Synthetic quarantined credential',categories:['profiles'],created_at:new Date(Date.now()-1000),expires_at:new Date(Date.now()+60000),revoked_at:null,last_used_at:null,credential_hash:null};
 const metadata=connectionMetadata(row);expect(metadata).toMatchObject({state:'revoked',revokedAt:null});expect(metadata).not.toHaveProperty('credential_hash');
 expect(connectionMetadata({...row,credential_hash:'a'.repeat(64)}).state).toBe('active');
 expect(connectionMetadata({...row,expires_at:new Date(Date.now()-1)}).state).toBe('expired');
});
it('refuses non-JSON recovery identity and detects changed content',()=>{
 expect(()=>recoveryDigest(undefined)).toThrow();const cycle:any={};cycle.self=cycle;expect(()=>recoveryDigest(cycle)).toThrow();expect(recoveryDigest({accepted:'before'})).not.toBe(recoveryDigest({accepted:'after'}));
});
