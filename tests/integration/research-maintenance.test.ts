import {randomUUID,createHash} from 'node:crypto';
import {Client} from 'pg';
import {beforeAll,expect,it} from 'vitest';
import {requireTestDatabaseUrl} from '../fixtures/database';
import {refreshRetainedPublicSource,retainedPublicSourceMaintenanceAllowed} from '../../lib/server/research/specialists/research-cache/sources';
import {maintainResearchEvidence} from '../../lib/server/research/specialists/research-cache/maintenance';
import {withTransaction} from '../../lib/server/db/client';
const isolated=requireTestDatabaseUrl();
beforeAll(()=>{const runtime=new URL(isolated);runtime.searchParams.set('options','-c role=turas_runtime');process.env.DATABASE_URL=runtime.href;process.env.DATABASE_URL_UNPOOLED=runtime.href;process.env.TURAS_ENVIRONMENT_ID=process.env.TURAS_TEST_ENVIRONMENT_ID;});

it('rechecks only retained public scope, preserves dated removed passages and needs no human identity',async()=>{
 const db=new Client({connectionString:isolated});await db.connect();try{
  expect(process.env.AI_GATEWAY_API_KEY??'').toBe('');
  expect((await withTransaction(client=>client.query('SELECT current_user AS role'))).rows[0].role).toBe('turas_runtime');
  const workspaceId=randomUUID(),accountId=randomUUID(),environmentId=process.env.TURAS_ENVIRONMENT_ID!,url='https://example.com/retained/'+randomUUID();
  await db.query("INSERT INTO workspaces(id,name) VALUES($1,'Disposable maintenance workspace')",[workspaceId]);
  await db.query("INSERT INTO customer_references(id,workspace_id,display_name,synthetic) VALUES($1,$2,'Disposable maintenance account',false)",[accountId,workspaceId]);
  const scope={environmentId,workspaceId},text='Retained service passage with synthetic public evidence.',removed='A historical passage no longer on the checked page.';
  const sessionsBefore=Number((await db.query('SELECT count(*) AS n FROM login_sessions')).rows[0].n);
  expect(await retainedPublicSourceMaintenanceAllowed(scope,accountId,url)).toBe(false);
  await expect(refreshRetainedPublicSource(scope,accountId,url,new AbortController().signal)).rejects.toThrow('no longer eligible');
  for(const [id,quote] of [['retained',text],['removed',removed]])await db.query(`INSERT INTO turas_public_learning
   (environment_id,workspace_id,account_id,id,source_id,snapshot_id,url,title,passage_id,quote,published_at,source_type,first_seen,last_seen)
   VALUES($1,$2,$3,$4,'synthetic','old-snapshot',$5,'Synthetic public source',$4,$6,'2025-01-01','customer_publication',now()-interval '3 days',now()-interval '2 days')`,[environmentId,workspaceId,accountId,id,url,quote]);
  const key='page:'+createHash('sha256').update(url).digest('hex');
  const source={id:'synthetic-public-source',url,title:'Synthetic public source',retrievedAt:new Date().toISOString(),excerpt:text};
  await db.query(`INSERT INTO turas_evidence_fetches(environment_id,workspace_id,key,value,checked_at,expires_at)
   VALUES($1,$2,$3,$4,now(),now()+interval '1 day')`,[environmentId,workspaceId,key,JSON.stringify({source,truncated:false})]);
  expect(await retainedPublicSourceMaintenanceAllowed(scope,accountId,url)).toBe(true);
  expect(await retainedPublicSourceMaintenanceAllowed({...scope,workspaceId:randomUUID()},accountId,url)).toBe(false);
  expect(await retainedPublicSourceMaintenanceAllowed({...scope,environmentId:'wrong-environment'},accountId,url)).toBe(false);
  const oldKey='old-'+randomUUID();
  for(const env of [environmentId,'other-maintenance-environment'])await db.query(`INSERT INTO turas_evidence_fetches(environment_id,workspace_id,key,checked_at,expires_at)
   VALUES($1,$2,$3,now()-interval '40 days',now()-interval '35 days')`,[env,workspaceId,oldKey]);
  const result=await maintainResearchEvidence(environmentId,new AbortController().signal);
  expect(result.refreshAttempted).toBeGreaterThanOrEqual(1);expect(result.refreshAttempted).toBeLessThanOrEqual(2);expect(result.refreshed).toBeGreaterThanOrEqual(1);expect(result.indexingAttempted).toBeLessThanOrEqual(3);
  const passages=(await db.query('SELECT id,snapshot_id,published_at,last_seen>now()-interval \'1 hour\' AS current FROM turas_public_learning WHERE environment_id=$1 AND workspace_id=$2 ORDER BY id',[environmentId,workspaceId])).rows;
  expect(passages.find(row=>row.id==='retained')).toMatchObject({current:true});expect(passages.find(row=>row.id==='retained').snapshot_id).not.toBe('old-snapshot');
  expect(passages.find(row=>row.id==='removed')).toMatchObject({current:false,snapshot_id:'old-snapshot'});
  expect(passages.every(row=>row.published_at.toISOString().startsWith('2025-01-01'))).toBe(true);
  expect((await db.query('SELECT environment_id FROM turas_evidence_fetches WHERE workspace_id=$1 AND key=$2',[workspaceId,oldKey])).rows).toEqual([{environment_id:'other-maintenance-environment'}]);
  expect(Number((await db.query('SELECT count(*) AS n FROM login_sessions')).rows[0].n)).toBe(sessionsBefore);
  expect(Number((await db.query('SELECT count(*) AS n FROM profile_records WHERE customer_id=$1',[accountId])).rows[0].n)).toBe(0);
  const sourceId=randomUUID(),revisionId=randomUUID();
  await db.query("INSERT INTO evidence_sources(id,workspace_id,customer_id,origin,canonical_location,trusted_ingest_identity) VALUES($1,$2,$3,'independent_research',$4,'synthetic-maintenance-check')",[sourceId,workspaceId,accountId,url]);
  await db.query(`INSERT INTO evidence_source_revisions(id,source_id,workspace_id,customer_id,version,location,title,passage,supported_claim,passage_digest,retrieval_at,rights,audience,quality_input)
   VALUES($1,$2,$3,$4,1,$5,'Synthetic source',$6,$6,$7,now(),'Synthetic only','delivery','{}')`,[revisionId,sourceId,workspaceId,accountId,url,text,'a'.repeat(64)]);
  expect(await retainedPublicSourceMaintenanceAllowed(scope,accountId,url)).toBe(false);
  await db.query(`INSERT INTO research_checks(source_revision_id,trusted_ingest_identity,check_version,identity_result,scope_result,integrity_result,content_result,rationale)
   VALUES($1,'synthetic-maintenance-check','synthetic',true,true,true,true,'Synthetic only')`,[revisionId]);
  expect(await retainedPublicSourceMaintenanceAllowed(scope,accountId,url)).toBe(true);
  await db.query("INSERT INTO evidence_source_events(id,source_revision_id,lifecycle_version,event_type,rationale) VALUES($1,$2,1,'withdraw','Synthetic withdrawal')",[randomUUID(),revisionId]);
  expect(await retainedPublicSourceMaintenanceAllowed(scope,accountId,url)).toBe(false);
  await expect(refreshRetainedPublicSource(scope,accountId,url,new AbortController().signal)).rejects.toThrow('no longer eligible');
  await expect(maintainResearchEvidence('wrong-environment',new AbortController().signal)).rejects.toThrow('environment mismatch');
 }finally{await db.end();}
});
