import {expect,it} from 'vitest';
import {Client,type PoolClient} from 'pg';
import {requireOwnedPilotDatabase} from '../../../scripts/pilot-environment';
import {withAuthorityEnvironment,lockAuthorityTarget} from '../../fixtures/pilot/recovery-authority';
import {pilotPublishedKnowledgeFixture} from '../../fixtures/pilot/knowledge';
import {withOwnerRecoveryReadCapability,requireOperationalOpen} from '../../../lib/server/operations/admission';
import {lockProfileActor} from '../../../lib/server/profiles/policy';

it('bounds owner recovery reads to one live actor, connection, control revision and deadline',async()=>{
 await withAuthorityEnvironment(async(owner,runtime,environmentId)=>{
  const f=await pilotPublishedKnowledgeFixture(owner as unknown as PoolClient,'primary');
  const locked=await lockAuthorityTarget(owner,environmentId),db=owner as unknown as PoolClient;
  const scope={environmentId,recoveryId:locked.recoveryId,controlRevision:locked.controlRevision,deadline:Date.now()+60000};
  await expect(withOwnerRecoveryReadCapability(db,f.actor,scope,async()=>{})).rejects.toThrow('active transaction');
  await owner.query('BEGIN');await runtime.query('BEGIN');
  const read=()=>lockProfileActor(db,f.actor,f.customerId,undefined,true);
  await expect(read()).rejects.toThrow('Service temporarily unavailable');
  await expect(withOwnerRecoveryReadCapability(db,{...f.actor,token:'a'.repeat(43)},scope,async()=>{})).rejects.toThrow('Exact owner');
  await expect(withOwnerRecoveryReadCapability(runtime as unknown as PoolClient,f.actor,scope,async()=>{})).rejects.toThrow('Exact owner');
  await expect(withOwnerRecoveryReadCapability(db,f.actor,{...scope,deadline:Date.now()-1},async()=>{})).rejects.toThrow('unavailable');
  await withOwnerRecoveryReadCapability(db,f.actor,scope,async()=>{
   await read();
   const concurrent=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)});await concurrent.connect();
   try{
    await concurrent.query("SET lock_timeout='250ms'");
    await expect(concurrent.query('UPDATE operations_control SET revision=revision+1 WHERE environment_id=$1',[environmentId])).rejects.toThrow('lock timeout');
    await expect(concurrent.query('UPDATE login_sessions SET revoked_at=clock_timestamp() WHERE id=$1',[f.actor.sessionId])).rejects.toThrow('lock timeout');
   }finally{await concurrent.end();}
   await expect(lockProfileActor(db,{...f.actor},f.customerId,undefined,true)).rejects.toThrow('Service temporarily unavailable');
   await expect(requireOperationalOpen(runtime as unknown as PoolClient,f.actor,true)).rejects.toThrow('Service temporarily unavailable');
   await runtime.query('COMMIT');
   await expect(lockProfileActor(db,f.actor,f.customerId)).rejects.toThrow('Service temporarily unavailable');
   await expect(withOwnerRecoveryReadCapability(db,f.actor,scope,async()=>{})).rejects.toThrow('unavailable');
   await owner.query('UPDATE operations_control SET revision=revision+1 WHERE environment_id=$1',[environmentId]);
   await expect(read()).rejects.toThrow('Service temporarily unavailable');
  });
  await expect(read()).rejects.toThrow('Service temporarily unavailable');
  const next={...scope,controlRevision:scope.controlRevision+1};
  await expect(withOwnerRecoveryReadCapability(db,f.actor,next,async()=>{throw Error('Controlled callback failure');})).rejects.toThrow('Controlled callback failure');
  await expect(read()).rejects.toThrow('Service temporarily unavailable');
  await withOwnerRecoveryReadCapability(db,f.actor,next,async()=>{
   await owner.query('UPDATE login_sessions SET revoked_at=clock_timestamp() WHERE id=$1',[f.actor.sessionId]);
   await expect(read()).rejects.toThrow('Sign in again');
  });
  await expect(withOwnerRecoveryReadCapability(db,f.actor,next,async()=>{})).rejects.toThrow('Exact owner');
  await owner.query('COMMIT');
  expect((await owner.query('SELECT mode FROM operations_control WHERE environment_id=$1',[environmentId])).rows[0].mode).toBe('locked');
 });
},210000);
