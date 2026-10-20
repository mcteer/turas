import {randomUUID} from 'node:crypto';
import {Client} from 'pg';
import {expect,it,vi} from 'vitest';
import {withPilotEnvironment,requireOwnedPilotDatabase} from '../../../scripts/pilot-environment';
import {closeRuntimePool} from '../../../lib/server/db/client';
import {withOperationalProviderIo,withOperationalIo} from '../../../lib/server/operations/admission';
import {embedRetrievalTexts} from '../../../lib/server/retrieval/embeddings';
import {cachedFetch} from '../../../lib/server/research/specialists/research-cache/fetch';
import {indexSnapshot} from '../../../lib/server/research/specialists/research-cache/sources';
import {refreshPublicLearning} from '../../../lib/server/research/specialists/research-cache/public-learning';
import {maintainResearchEvidence} from '../../../lib/server/research/specialists/research-cache/maintenance';
import {z} from 'zod';
const provider=vi.hoisted(()=>({calls:0,started:()=>{},release:()=>{},maximumRetries:-1}));
vi.mock('ai',async original=>({...await original<typeof import('ai')>(),embedMany:async(input:{values:string[];abortSignal:AbortSignal;maxRetries:number})=>{
 provider.calls++;provider.maximumRetries=input.maxRetries;
 await new Promise<void>((resolve,reject)=>{const abort=()=>reject(input.abortSignal.reason);input.abortSignal.addEventListener('abort',abort,{once:true});provider.release=()=>{input.abortSignal.removeEventListener('abort',abort);resolve();};provider.started();if(input.abortSignal.aborted)abort();});
 return {embeddings:input.values.map(()=>Array.from({length:1536},()=>0.1)),providerMetadata:{}};
}}));
it('drains admitted provider publication before recovery and rejects new cron cache and embedding work while locked',async()=>{
 await withPilotEnvironment(async environment=>{
  const owner=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)});await owner.connect();
  try{
   expect(await withOperationalProviderIo(async()=> 'released077')).toBe('released077');await closeRuntimePool();await environment.upgradeToCurrent();
   process.env.AI_GATEWAY_API_KEY='synthetic-controlled-provider';provider.calls=0;
   const begun=()=>new Promise<void>(resolve=>{provider.started=resolve;});
   let started=begun();const key=randomUUID(),work=embedRetrievalTexts(['Synthetic retained public text'],{operationKey:key});
   await Promise.race([started,work.then(()=>{throw Error('Provider did not wait');})]);
   expect((await owner.query('SELECT pg_try_advisory_lock(hashtextextended($1,16017)) AS available',[environment.environmentId])).rows[0].available).toBe(false);
   provider.release();expect((await work)[0]).toHaveLength(1536);
   expect((await owner.query('SELECT state FROM retrieval_embedding_operations WHERE operation_key=$1',[key])).rows).toEqual([{state:'succeeded'}]);
   const cancellation=new AbortController();started=begun();const abortKey=randomUUID(),aborted=embedRetrievalTexts(['Synthetic cancelled public text'],{operationKey:abortKey,signal:cancellation.signal});
   const failure=expect(aborted).rejects.toThrow('outcome unconfirmed');await Promise.race([started,aborted.then(()=>{throw Error('Provider did not wait');})]);cancellation.abort(Error('Controlled caller cancellation'));await failure;
   expect((await owner.query('SELECT state FROM retrieval_embedding_operations WHERE operation_key=$1',[abortKey])).rows).toEqual([{state:'unconfirmed'}]);expect(provider.calls).toBe(2);expect(provider.maximumRetries).toBe(0);
   expect((await owner.query('SELECT pg_try_advisory_lock(hashtextextended($1,16017)) AS available',[environment.environmentId])).rows[0].available).toBe(true);
   try{await owner.query("UPDATE operations_control SET mode='locked',revision=revision+1,recovery_id=$2 WHERE environment_id=$1",[environment.environmentId,randomUUID()]);}finally{await owner.query('SELECT pg_advisory_unlock(hashtextextended($1,16017))',[environment.environmentId]);}
   const inventory=async()=>(await owner.query(`SELECT (SELECT count(*) FROM retrieval_embedding_operations)::int AS embeddings,(SELECT count(*) FROM turas_evidence_fetches)::int AS fetches,(SELECT coalesce(sum(index_attempts),0) FROM turas_evidence_snapshots)::int AS indexing,(SELECT count(*) FROM turas_public_learning)::int AS learning`)).rows[0],before=await inventory();
   const signal=new AbortController().signal,identity={environmentId:environment.environmentId,workspaceId:randomUUID()};let calls=0;
   for(const run of [()=>withOperationalProviderIo(async()=>{calls++;}),()=>cachedFetch(identity,randomUUID(),z.string(),async()=>{calls++;return 'synthetic';},signal),()=>indexSnapshot(identity,randomUUID(),signal),()=>refreshPublicLearning(environment.environmentId,signal),()=>maintainResearchEvidence(environment.environmentId,signal),()=>embedRetrievalTexts(['Denied retained text'],{operationKey:randomUUID()})])await expect(run()).rejects.toMatchObject({status:503});
   expect(calls).toBe(0);expect(provider.calls).toBe(2);expect(await inventory()).toEqual(before);
   expect(await withOperationalIo(async()=> 'deny-only cleanup',true)).toBe('deny-only cleanup');
  }finally{provider.release();await closeRuntimePool();await owner.end();}
 },{priorSchema:77,postgresMajor:18,deadlineMs:180000});
},210000);
