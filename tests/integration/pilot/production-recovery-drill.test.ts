import {it,expect,vi} from 'vitest';
import {Client} from 'pg';
import {randomUUID} from 'node:crypto';
import {withPilotEnvironment,requireOwnedPilotDatabase} from '../../../scripts/pilot-environment';
import {closeRuntimePool} from '../../../lib/server/db/client';
import {assertDrillIsolation,observeDrillBranch,readDrillDatabaseIdentity,requireClosedDrillRuntime,admitVerifiedIsolatedDrill,verifyClosedDrillDatabase,refenceDrillTarget,assertDrillRuntimeConfiguration} from '../../../lib/server/operations/production-recovery-drill';

it('binds an isolated drill to actual provider readback and refuses Production or pre-start targets',async()=>{
 const drillId=randomUUID(),startedAt=new Date(Date.now()-5000).toISOString(),createdAt=new Date(Date.now()-1000).toISOString();
 const input={projectId:'owned-project',branchId:'br-new',endpointId:'ep-new',drillId,startedAt,sourceConnection:'postgres://owner:owned@source.neon.tech/neondb?sslmode=verify-full',targetConnection:'postgres://owner:owned@restored.neon.tech/neondb?sslmode=verify-full'};
 const runtime='postgres://turas_runtime_016:owned@restored.neon.tech/neondb?sslmode=verify-full',environmentId='production-owned-drill',origin='https://owned-drill.vercel.app';
 const config={DATABASE_URL:runtime,DATABASE_URL_UNPOOLED:runtime,TURAS_ENVIRONMENT_ID:environmentId,TURAS_APP_ORIGIN:origin},selection={runtimeConnection:runtime,environmentId,origin,processEnvironmentId:environmentId};
 expect(()=>assertDrillRuntimeConfiguration(config,selection)).not.toThrow();
 for(const wrong of [{...config,DATABASE_URL:input.sourceConnection},{...config,DATABASE_URL_UNPOOLED:input.sourceConnection},{...config,TURAS_ENVIRONMENT_ID:'local'},{...config,TURAS_APP_ORIGIN:'https://www.turas.dev'}])expect(()=>assertDrillRuntimeConfiguration(wrong,selection)).toThrow('isolated Production recovery drill');
 expect(()=>assertDrillRuntimeConfiguration(config,{...selection,processEnvironmentId:'local'})).toThrow('isolated Production recovery drill');
 const branch={projectId:input.projectId,branchId:input.branchId,endpointId:input.endpointId,host:'restored.neon.tech',createdAt,name:'turas-recovery-drill-'+drillId};
 expect(()=>assertDrillIsolation(input,branch)).not.toThrow();
 for(const wrong of [{...input,targetConnection:input.sourceConnection},{...input,startedAt:new Date(Date.now()).toISOString()},{...input,branchId:'br-other'},{...input,endpointId:'ep-other'}])expect(()=>assertDrillIsolation(wrong,branch)).toThrow('isolated Production recovery drill');
 expect(()=>assertDrillIsolation(input,{...branch,host:'source.neon.tech'})).toThrow();
 expect(()=>assertDrillIsolation(input,{...branch,name:'ordinary-branch'})).toThrow();
 const old=process.env.NEON_API_KEY;process.env.NEON_API_KEY='owned-fake-provider-key';let requests=0;
 vi.stubGlobal('fetch',async(url:string,init:RequestInit)=>{requests++;expect(init.method??'GET').toBe('GET');expect(String(url)).toMatch(/^https:\/\/console\.neon\.tech\/api\/v2\/projects\/owned-project\//);return String(url).includes('/branches/')?Response.json({branch:{id:'br-new',project_id:input.projectId,name:branch.name,created_at:createdAt}}):Response.json({endpoint:{id:'ep-new',project_id:input.projectId,branch_id:'br-new',type:'read_write',host:branch.host}});});
 try{expect(await observeDrillBranch(input,AbortSignal.timeout(5000))).toEqual(branch);expect(requests).toBe(2);}finally{vi.unstubAllGlobals();if(old===undefined)delete process.env.NEON_API_KEY;else process.env.NEON_API_KEY=old;}
});

it('requires actual closed restricted runtimes and rejects serialized drill approval without changing control',async()=>{
 await withPilotEnvironment(async environment=>{
  const owner=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)});await owner.connect();
  try{
   await closeRuntimePool();await owner.query('BEGIN');
   const before=await readDrillDatabaseIdentity(owner);expect(before).toMatchObject({environmentId:environment.environmentId,schemaVersion:81,owner:true,mode:'open'});
   await expect(requireClosedDrillRuntime(owner)).rejects.toThrow('Legacy work runtime');
   await owner.query('ALTER ROLE turas_runtime NOLOGIN');
   await owner.query('CREATE ROLE turas_runtime_016 NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS');
   await expect(requireClosedDrillRuntime(owner)).resolves.toBeUndefined();
   await owner.query('ALTER ROLE turas_runtime_016 LOGIN');await expect(requireClosedDrillRuntime(owner)).rejects.toThrow('isolated Production recovery drill');await owner.query('ALTER ROLE turas_runtime_016 NOLOGIN');
   await owner.query('GRANT UPDATE ON operations_control TO turas_runtime_016');await expect(requireClosedDrillRuntime(owner)).rejects.toThrow('isolated Production recovery drill');await owner.query('REVOKE UPDATE ON operations_control FROM turas_runtime_016');
   await expect(admitVerifiedIsolatedDrill(owner,{approved:true} as never)).rejects.toThrow('isolated Production recovery drill');
   await expect(verifyClosedDrillDatabase(owner,{archive:{verified:true},objects:{verified:true},branch:{verified:true},drillId:randomUUID(),denials:{verified:true}} as never)).rejects.toThrow('isolated Production recovery drill');
   expect((await readDrillDatabaseIdentity(owner)).revision).toBe(before.revision);
   const drillId=randomUUID();await owner.query("UPDATE operations_control SET mode='open',recovery_id=$2 WHERE environment_id=$1",[environment.environmentId,drillId]);await owner.query('ALTER ROLE turas_runtime_016 LOGIN');
   // Real durable admission state, followed by a simulated lost acknowledgement.
   await owner.query('COMMIT');let admissionMayHaveCommitted=false;
   try{admissionMayHaveCommitted=true;throw Error('Owned simulated post-COMMIT lost acknowledgement');}catch{
    expect(admissionMayHaveCommitted).toBe(true);const state=await readDrillDatabaseIdentity(owner);
    expect(await refenceDrillTarget(owner,{environmentId:environment.environmentId,databaseName:state.databaseName,systemIdentifier:state.systemIdentifier,host:(owner as any).connectionParameters.host,drillId})).toMatchObject({targetRefenced:true,runtimeLogin:false,mode:'locked'});
    expect((await owner.query("SELECT count(*)::int AS n FROM operations_control_transitions WHERE recovery_id=$1 AND from_mode='open' AND to_mode='locked'",[drillId])).rows[0].n).toBe(1);
   }

  }finally{await owner.query('ROLLBACK');await owner.end();}
 },{postgresMajor:18,deadlineMs:180000});
},210000);
