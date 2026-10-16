import {randomUUID} from 'node:crypto';
import {Client} from 'pg';
import {beforeAll,expect,it} from 'vitest';
import {requireTestDatabaseUrl} from '../fixtures/database';
import {legacyResearchFixture,legacyResearchSource} from '../fixtures/legacy-research';
import {isolatedChatActor} from '../fixtures/isolated-chat-actor';
import {storedSourceCandidates} from '../../lib/server/research/specialists/research-cache/sources';
import {recallPublicLearning} from '../../lib/server/research/specialists/research-cache/public-learning-read';
import {sourceLibrary} from '../../lib/server/research/specialists/research-cache/library';
const isolated=requireTestDatabaseUrl();
beforeAll(()=>{const url=new URL(isolated);url.searchParams.set('options','-c role=turas_runtime');process.env.DATABASE_URL=url.href;process.env.DATABASE_URL_UNPOOLED=url.href;process.env.TURAS_ENVIRONMENT_ID=process.env.TURAS_TEST_ENVIRONMENT_ID;});
it('pages twenty current eligible sources, masks another owner workload and rechecks withdrawal/grants',async()=>{
 const db=new Client({connectionString:isolated});await db.connect();try{
  const {actor,customerId,identity}=await legacyResearchFixture(db),otherOwner=randomUUID();
  const items:Array<Awaited<ReturnType<typeof legacyResearchSource>>>=[];
  for(let i=0;i<22;i++)items.push(await legacyResearchSource(db,identity,customerId,{quote:'Synthetic retained source, no deployment inference.',age:i,owner:i===0?otherOwner:undefined,workload:i===0?'Other owner private question':'Owned workload'}));
  // A newer snapshot of the same fetch key replaces the older snapshot in paging.
  const old=items[21];
  await db.query(`INSERT INTO turas_evidence_snapshots(environment_id,workspace_id,id,fetch_key,url,content_hash,source,truncated,checked_at,refresh_after)
   SELECT environment_id,workspace_id,$2,fetch_key,url,$2,source,true,now()+interval '1 minute',refresh_after FROM turas_evidence_snapshots WHERE id=$1`,[old.snapshotId,'e'.repeat(64)]);
  await db.query(`INSERT INTO turas_evidence_accounts(environment_id,workspace_id,owner_user_id,account_id,workload,snapshot_id,visibility)
   SELECT environment_id,workspace_id,owner_user_id,account_id,workload,$2,visibility FROM turas_evidence_accounts WHERE snapshot_id=$1`,[old.snapshotId,'e'.repeat(64)]);
  await db.query("INSERT INTO evidence_source_events(id,source_revision_id,lifecycle_version,event_type,rationale) VALUES($1,$2,1,'withdraw','Synthetic withdrawal')",[randomUUID(),items[20].revisionId]);
  const first=await sourceLibrary(identity,customerId,new AbortController().signal);
  expect(first.sources).toHaveLength(20);expect(first.more).toBe(true);
  expect(first.sources.some(row=>row.id===old.snapshotId)).toBe(false);
  expect(first.sources.some(row=>row.id==='e'.repeat(64)&&row.truncated)).toBe(true);
  expect(first.sources.find(row=>row.url===items[0].url)?.workloads).toEqual(['Public source']);
  expect(JSON.stringify(first)).not.toContain('Other owner private question');
  expect(first.sources.every(row=>row.sourceRevisionId&&row.publishedAt===null)).toBe(true);
  const second=await sourceLibrary(identity,customerId,new AbortController().signal,20);
  expect(second.sources).toHaveLength(1);expect(second.more).toBe(false);
  expect(new Set([...first.sources,...second.sources].map(row=>row.id)).size).toBe(21);
  expect([...first.sources,...second.sources].some(row=>row.url===items[20].url)).toBe(false);
  await expect(sourceLibrary(identity,customerId,new AbortController().signal,-1)).rejects.toMatchObject({status:400});
  await expect(sourceLibrary({...identity,environmentId:'other-environment'},customerId,new AbortController().signal)).rejects.toMatchObject({status:404});
  const partner=await isolatedChatActor(db,'partner','member',actor.workspaceId),partnerIdentity={...partner,userId:partner.principalId,environmentId:identity.environmentId};
  await expect(sourceLibrary(partnerIdentity,customerId,new AbortController().signal)).rejects.toMatchObject({status:404});
  await db.query("INSERT INTO customer_grants(id,workspace_id,customer_id,membership_id,state,revision,granted_by) VALUES($1,$2,$3,$4,'active',1,$5)",[randomUUID(),actor.workspaceId,customerId,partner.membershipId,actor.principalId]);
  expect((await sourceLibrary(partnerIdentity,customerId,new AbortController().signal)).sources).toHaveLength(20);
  await db.query("UPDATE customer_grants SET state='revoked' WHERE customer_id=$1 AND membership_id=$2",[customerId,partner.membershipId]);
  await expect(sourceLibrary(partnerIdentity,customerId,new AbortController().signal,20)).rejects.toMatchObject({status:404});
 }finally{await db.end();}
});

it('fills eight ranked hints after withholding withdrawn, superseded and confirmed-conflicted source metadata',async()=>{
 const db=new Client({connectionString:isolated});await db.connect();try{
  const {customerId,identity}=await legacyResearchFixture(db);
  const blocked:Array<Awaited<ReturnType<typeof legacyResearchSource>>>=[];
  for(let i=0;i<3;i++)blocked.push(await legacyResearchSource(db,identity,customerId,{quote:'Quasar retained source with confidential withdrawn metadata marker.',title:'Hidden source '+i}));
  for(const [index,event] of ['withdraw','supersede'].entries())await db.query("INSERT INTO evidence_source_events(id,source_revision_id,lifecycle_version,event_type,rationale) VALUES($1,$2,1,$3,'Synthetic lifecycle exclusion')",[randomUUID(),blocked[index].revisionId,event]);
  await db.query(`INSERT INTO evidence_conflict_targets(id,environment_id,scope,workspace_id,customer_id,first_kind,first_revision_id,second_kind,second_revision_id,period_start,period_end,state,rationale)
   VALUES($1,$2,'customer',$3,$4,'verified_research',$5,'verified_research',$6,'2026-01-01','2026-12-31','confirmed','Synthetic confirmed source conflict')`,[randomUUID(),identity.environmentId,identity.workspaceId,customerId,blocked[2].revisionId,randomUUID()]);
  const eligible:Array<Awaited<ReturnType<typeof legacyResearchSource>>>=[];
  for(let i=0;i<8;i++)eligible.push(await legacyResearchSource(db,identity,customerId,{quote:'Quasar retained eligible source.',title:'Visible source '+i}));
  const hints=await storedSourceCandidates(identity,customerId,'synthetic workload','quasar',new AbortController().signal);
  expect(hints.retrieval).toBe('keyword');expect(hints.sources).toHaveLength(8);
  expect(hints.sources.map(row=>row.url).sort()).toEqual(eligible.map(row=>row.url).sort());
  for(const source of blocked){expect(JSON.stringify(hints)).not.toContain(source.url);expect(JSON.stringify(hints)).not.toContain(source.snapshotId);}
  expect(JSON.stringify(hints)).not.toContain('Hidden source');
  expect((await sourceLibrary(identity,customerId,new AbortController().signal)).sources).toHaveLength(8);
  expect((await recallPublicLearning(identity,customerId,'',new AbortController().signal)).map(row=>row.url).sort()).toEqual(eligible.map(row=>row.url).sort());
 }finally{await db.end();}
});
