import {beforeAll,afterAll,it,expect} from 'vitest';
import {Pool,type PoolClient} from 'pg';
import {randomUUID} from 'node:crypto';
import {requireOwnedPilotDatabase} from '../../../scripts/pilot-environment';
import {closeRuntimePool} from '../../../lib/server/db/client';
import {maintenanceBacklog} from '../../../lib/server/operations/maintenance-bindings';
import {markDueResearch} from '../../../lib/server/research/refresh';
import {weakPublicExpansionEvidence} from '../../fixtures/expansion/evidence';
import {suspendStaleKnowledge} from '../../../lib/server/knowledge/suspension';
import {pilotPublishedKnowledgeFixture} from '../../fixtures/pilot/knowledge';
const pool=new Pool({connectionString:requireOwnedPilotDatabase(process.env,true)});let db:PoolClient;const environment=process.env.TURAS_ENVIRONMENT_ID!;
beforeAll(async()=>{db=await pool.connect();});afterAll(async()=>{db.release();await pool.end();await closeRuntimePool();});
it('queries all actual maintenance queue schemas with bounded anonymous metadata',async()=>{for(const id of ['conversation','artifacts','workforce','retrieval','research-freshness','knowledge','plans','execution','support','expansion','reports','gaps','partners','learning','mcp']){const result=await maintenanceBacklog(id);expect(result.backlog).toBeGreaterThanOrEqual(0);expect(result.backlog).toBeLessThanOrEqual(1000);expect(Object.keys(result).sort()).toEqual(['backlog','oldestDueAt','truncated']);}
 const fixture=await pilotPublishedKnowledgeFixture(db,'primary');
 const before=await maintenanceBacklog('retrieval');
 const cases:Array<{lifecycle:string;state:string;attempts:number;counted:boolean;passage?:boolean;operation?:string;kind?:string}>=[
  {lifecycle:'retired',state:'failed',attempts:3,counted:false},
  {lifecycle:'tombstoned',state:'failed',attempts:3,counted:false},
  {lifecycle:'current',state:'failed',attempts:3,counted:true},
  {lifecycle:'retired',state:'failed',attempts:3,counted:true,passage:true},
  {lifecycle:'retired',state:'failed',attempts:3,counted:true,operation:'dispatched'},
  {lifecycle:'retired',state:'failed',attempts:3,counted:true,operation:'unconfirmed'},
  {lifecycle:'retired',state:'queued',attempts:0,counted:true},
  {lifecycle:'retired',state:'leased',attempts:1,counted:true},
  {lifecycle:'retired',state:'unconfirmed',attempts:3,counted:true},
  {lifecycle:'retired',state:'failed',attempts:1,counted:false},
  {lifecycle:'retired',state:'failed',attempts:3,counted:true,operation:'reserved'},
  ...['queued','leased','failed','unconfirmed'].map(state=>({lifecycle:'current',state,attempts:state==='queued'?0:1,counted:false,kind:'index'})),
 ];
 const sources:string[]=[],jobs:string[]=[];
 for(const item of cases){
  const source=randomUUID(),job=randomUUID(),digest=randomUUID().replaceAll('-','').repeat(2);sources.push(source);jobs.push(job);
  await db.query(`INSERT INTO retrieval_sources(id,environment_id,scope,source_kind,source_revision_id,audience,projection_contract,contract_digest,source_generation,content_digest,lifecycle_state)
   VALUES($1,$2,'shared','published_shared',$3,'shared','retrieval-v1',$4,$5,$4,$6)`,[source,environment,fixture.revisionId,digest,fixture.generation,item.lifecycle]);
  await db.query(`INSERT INTO retrieval_jobs(id,environment_id,source_id,source_generation,contract_digest,kind,state,attempts,lease_token,lease_started_at,lease_until)
   VALUES($1,$2,$3,$4,$5,$8,$6,$7,CASE WHEN $6='leased' THEN $1::uuid END,CASE WHEN $6='leased' THEN clock_timestamp()-interval '20 seconds' END,CASE WHEN $6='leased' THEN clock_timestamp()-interval '1 second' END)`,[job,environment,source,fixture.generation,digest,item.state,item.attempts,'kind' in item?item.kind:'cleanup']);
  if(item.passage)await db.query(`INSERT INTO retrieval_passages(id,source_id,ordinal,passage_digest,passage_text,locators) VALUES($1,$2,1,$3,'Synthetic retained projection','[{"kind":"synthetic"}]')`,[randomUUID(),source,digest]);
  if(item.operation){const operationJob=randomUUID();jobs.push(operationJob);
   await db.query(`INSERT INTO retrieval_jobs(id,environment_id,source_id,source_generation,contract_digest,kind,state) VALUES($1,$2,$3,$4,$5,'index','completed')`,[operationJob,environment,source,fixture.generation,digest]);
   await db.query(`INSERT INTO retrieval_embedding_operations(id,environment_id,job_id,operation_kind,operation_key,state,embedding_contract,model_id,dimensions,input_characters,dispatched_at)
   VALUES($1::uuid,$2,$3,'index',$1::text,$4,'embedding-v1','openai/text-embedding-3-small',1536,100,clock_timestamp())`,[randomUUID(),environment,operationJob,item.operation]);}
 }
 const snapshot=async()=>({sources:(await db.query('SELECT * FROM retrieval_sources WHERE id=ANY($1::uuid[]) ORDER BY id',[sources])).rows,
  jobs:(await db.query('SELECT * FROM retrieval_jobs WHERE id=ANY($1::uuid[]) ORDER BY id',[jobs])).rows,
  passages:(await db.query('SELECT * FROM retrieval_passages WHERE source_id=ANY($1::uuid[]) ORDER BY id',[sources])).rows,
  operations:(await db.query('SELECT * FROM retrieval_embedding_operations WHERE job_id=ANY($1::uuid[]) ORDER BY id',[jobs])).rows});
 const retained=await snapshot();
 expect((await maintenanceBacklog('retrieval')).backlog).toBe(before.backlog+cases.filter(item=>item.counted).length);
 const indexRows=(await db.query("SELECT state FROM retrieval_jobs WHERE id=ANY($1::uuid[]) AND kind='index' AND state IN ('queued','leased','failed','unconfirmed') ORDER BY state",[jobs])).rows;
 expect(indexRows.map(row=>row.state)).toEqual(['failed','leased','queued','unconfirmed']);
 expect(await snapshot()).toEqual(retained);
 // Already-marked recheck notices remain visible; only scheduling work is this lane's backlog.
 const research=await weakPublicExpansionEvidence(fixture.actor,fixture.customerId);
 const revision=research.reference.sourceRevisionId;
 await markDueResearch();
 const notice=(await db.query('SELECT * FROM research_review_due WHERE source_revision_id=$1',[revision])).rows[0];
 expect(notice).toBeDefined();
 await db.query("UPDATE research_review_due SET state='due',due_at=clock_timestamp()-interval '1 day',updated_at=clock_timestamp() WHERE source_revision_id=$1",[revision]);
 const marked=(await db.query('SELECT * FROM research_review_due WHERE source_revision_id=$1',[revision])).rows[0];
 const scheduled=await maintenanceBacklog('research-freshness');
 expect(scheduled.backlog).toBe(0);
 expect(scheduled.oldestDueAt).toBeNull();
 expect((await db.query('SELECT * FROM research_review_due WHERE source_revision_id=$1',[revision])).rows[0]).toEqual(marked);
 await db.query("UPDATE research_review_due SET updated_at=clock_timestamp()-interval '2 hours' WHERE source_revision_id=$1",[revision]);
 const stale=await maintenanceBacklog('research-freshness');
 expect(stale.backlog).toBe(scheduled.backlog+1);
 expect(stale.oldestDueAt!.getTime()).toBeLessThan(Date.now()-3500000);
 await markDueResearch();
 expect((await maintenanceBacklog('research-freshness')).backlog).toBe(scheduled.backlog);
 await db.query('DELETE FROM research_review_due WHERE source_revision_id=$1',[revision]);
 expect((await maintenanceBacklog('research-freshness')).backlog).toBe(scheduled.backlog+1);
 await markDueResearch();
 const current=(await db.query('SELECT * FROM research_review_due WHERE source_revision_id=$1',[revision])).rows[0];
 expect(current).toBeDefined();
 expect((await maintenanceBacklog('research-freshness')).backlog).toBe(scheduled.backlog);
});
it('excludes future cleanup and retry work while preserving the oldest actual due time',async()=>{const workspace=(await db.query('SELECT id FROM workspaces ORDER BY id LIMIT 1')).rows[0].id;await db.query('INSERT INTO learning_workspace_state(environment_id,workspace_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[environment,workspace]);const before=await maintenanceBacklog('learning');const ids=[randomUUID(),randomUUID(),randomUUID()];for(let i=0;i<3;i++)await db.query("INSERT INTO learning_cleanup_jobs(id,environment_id,workspace_id,owner_kind,owner_id,due_at,next_attempt_at) VALUES($1,$2,$3,'synthetic_health',$4,clock_timestamp()+($5::int*interval '1 hour'),clock_timestamp()+($6::int*interval '1 hour'))",[ids[i],environment,workspace,randomUUID(),i===0?1:-3,i===1?1:-2]);const result=await maintenanceBacklog('learning');expect(result.backlog).toBe(before.backlog+1);expect(result.oldestDueAt!.getTime()).toBeLessThan(Date.now()-3600000);await db.query("UPDATE learning_cleanup_jobs SET state='completed',completed_at=clock_timestamp() WHERE id=ANY($1::uuid[])",[ids]);expect((await maintenanceBacklog('learning')).backlog).toBe(before.backlog);});
it('caps overdue counts after ordering without hiding the oldest due item',async()=>{const workspace=(await db.query('SELECT id FROM workspaces ORDER BY id LIMIT 1')).rows[0].id;const ids=Array.from({length:1002},()=>randomUUID());await db.query("INSERT INTO learning_cleanup_jobs(id,environment_id,workspace_id,owner_kind,owner_id,due_at,next_attempt_at) SELECT id,$2,$3,'synthetic_health_cap',id,clock_timestamp()-interval '3 hours',clock_timestamp()-interval '2 hours' FROM unnest($1::uuid[]) id",[ids,environment,workspace]);const result=await maintenanceBacklog('learning');expect(result).toMatchObject({backlog:1000,truncated:true});expect(result.oldestDueAt!.getTime()).toBeLessThan(Date.now()-3600000);await db.query("UPDATE learning_cleanup_jobs SET state='completed',completed_at=clock_timestamp() WHERE id=ANY($1::uuid[])",[ids]);});
it('records actual knowledge inspection durably and does not keep healthy publications overdue',async()=>{const fixture=await pilotPublishedKnowledgeFixture(db,'primary');await db.query("UPDATE knowledge_publications SET last_maintenance_checked_at=NULL WHERE id=$1",[fixture.publicationId]);const before=await maintenanceBacklog('knowledge');expect(before.backlog).toBeGreaterThan(0);await suspendStaleKnowledge();const row=(await db.query('SELECT state,last_maintenance_checked_at FROM knowledge_publications WHERE id=$1',[fixture.publicationId])).rows[0];expect(row.state).toBe('published');expect(row.last_maintenance_checked_at).toBeInstanceOf(Date);expect((await maintenanceBacklog('knowledge')).backlog).toBeLessThan(before.backlog);});
