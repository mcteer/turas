import {it,expect} from 'vitest';
import {randomUUID,randomBytes} from 'node:crypto';
import type {Client} from 'pg';
import {withAuthorityEnvironment,lockAuthorityTarget} from '../../fixtures/pilot/recovery-authority';
import {quarantineRestoredAuthority} from '../../../lib/server/operations/recovery-quarantine';
import {resolveRecoveryQuarantines} from '../../../lib/server/operations/recovery-resolution';
import {currentRecoveryStateDigest} from '../../../lib/server/operations/recovery-state';
import {transitionRecoveryControl} from '../../../lib/server/operations/control';
import {readOperationalHealth} from '../../../lib/server/operations/health';
import {pilotRecoveryAuthority} from '../../../scripts/pilot-recovery-authority';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';

type Scope={environmentId:string;recoveryId:string;controlRevision:number};
/** Controlled owner verification rows prove fence mechanics only. These are
 * neither actual provider proof nor a Production recovery authorization. */
async function verification(owner:Client,scope:Scope,override:{flag?:string;age?:string;foreign?:boolean}={}){
 await owner.query('BEGIN');let digest:string;try{digest=await currentRecoveryStateDigest(owner);await owner.query('COMMIT');}catch(error){await owner.query('ROLLBACK');throw error;}
 const id=randomUUID(),bundle=randomBytes(32).toString('hex');
 const flags=['required_scope_healthy','integrity_verified','denial_verified','replay_verified','workflow_verified'].map(name=>name!==override.flag);
 await owner.query(`INSERT INTO operations_recovery_verifications(id,environment_id,recovery_id,control_revision,bundle_digest,ledger_digest,objects_digest,current_state_digest,denial_digest,replay_digest,workflow_digest,scope_digest,required_scope_healthy,integrity_verified,denial_verified,replay_verified,workflow_verified,verified_at)
  VALUES($1,$2,$3,$4,$5,$5,$5,$6,$5,$5,$5,$5,$7,$8,$9,$10,$11,clock_timestamp()+$12::interval)`,[id,scope.environmentId,override.foreign?randomUUID():scope.recoveryId,scope.controlRevision,bundle,digest,...flags,override.age??'0 seconds']);
 return {id,bundle};
}
async function fixture(run:(owner:Client,runtime:Client,scope:Scope)=>Promise<void>){await withAuthorityEnvironment(async(owner,runtime,environmentId)=>{const locked=await lockAuthorityTarget(owner,environmentId),scope={environmentId,recoveryId:locked.recoveryId,controlRevision:locked.controlRevision};await quarantineRestoredAuthority(owner,scope);await run(owner,runtime,scope);});}
const open=(scope:Scope,bundle:string)=>({environmentId:scope.environmentId,recoveryId:scope.recoveryId,expectedRevision:scope.controlRevision,operationId:randomUUID(),mode:'open' as const,verifiedBundleDigest:bundle});
const count=async(owner:Client)=>Number((await owner.query('SELECT count(*) AS n FROM operations_recovery_quarantine_resolutions')).rows[0].n);

it('denies runtime and delegated resolution authority',async()=>fixture(async(owner,runtime,scope)=>{
 const proof=await verification(owner,scope),input={...scope,verificationId:proof.id};
 await expect(resolveRecoveryQuarantines(runtime,input)).rejects.toThrow('actual owner');
 await expect(runtime.query("INSERT INTO operations_recovery_quarantine_resolutions(environment_id,recovery_id,scope_kind,verification_id) VALUES($1,$2,'sessions',$3)",[scope.environmentId,scope.recoveryId,proof.id])).rejects.toMatchObject({code:'42501'});
 await owner.query('GRANT INSERT ON operations_recovery_quarantine_resolutions TO turas_runtime');
 try{await expect(runtime.query("INSERT INTO operations_recovery_quarantine_resolutions(environment_id,recovery_id,scope_kind,verification_id) VALUES($1,$2,'sessions',$3)",[scope.environmentId,scope.recoveryId,proof.id])).rejects.toThrow('owner authority');}finally{await owner.query('REVOKE INSERT ON operations_recovery_quarantine_resolutions FROM turas_runtime');}
 expect(await count(owner)).toBe(0);
}),210000);
it('refuses missing incomplete stale future and foreign verification',async()=>fixture(async(owner,_runtime,scope)=>{
 await expect(resolveRecoveryQuarantines(owner,{...scope,verificationId:randomUUID()})).rejects.toThrow('Fresh complete');
 for(const flag of ['required_scope_healthy','integrity_verified','denial_verified','replay_verified','workflow_verified']){const proof=await verification(owner,scope,{flag});await expect(resolveRecoveryQuarantines(owner,{...scope,verificationId:proof.id})).rejects.toThrow('Fresh complete');}
 for(const change of [{age:'-31 minutes'},{age:'1 minute'},{foreign:true}]){const proof=await verification(owner,scope,change);await expect(resolveRecoveryQuarantines(owner,{...scope,verificationId:proof.id})).rejects.toThrow('Fresh complete');}
 expect(await count(owner)).toBe(0);expect((await owner.query('SELECT mode FROM operations_control')).rows[0].mode).toBe('locked');
}),210000);
it('refuses resolution after verified state or control identity changes',async()=>fixture(async(owner,_runtime,scope)=>{
 const proof=await verification(owner,scope),input={...scope,verificationId:proof.id};
 await expect(resolveRecoveryQuarantines(owner,{...input,controlRevision:scope.controlRevision+1})).rejects.toThrow('Exact locked');
 await expect(resolveRecoveryQuarantines(owner,{...input,recoveryId:randomUUID()})).rejects.toThrow('Exact locked');
 await owner.query("UPDATE principals SET display_name=display_name || ' synthetic changed state' WHERE id=(SELECT id FROM principals ORDER BY id LIMIT 1)");
 await expect(resolveRecoveryQuarantines(owner,input)).rejects.toThrow('verified state changed');expect(await count(owner)).toBe(0);
}),210000);
it('retains immutable quarantine history and resolves repeatably before separate unlock',async()=>fixture(async(owner,_runtime,scope)=>{
 const proof=await verification(owner,scope),input={...scope,verificationId:proof.id};
 expect(await resolveRecoveryQuarantines(owner,input)).toMatchObject({newlyResolved:7,quarantineHistoryRetained:true,serviceOpened:false,restorationReady:false});
 expect(await resolveRecoveryQuarantines(owner,input)).toMatchObject({newlyResolved:0});
 const root=await mkdtemp(resolve('local-artifacts/016/resolution-cli-'));
 try{await pilotRecoveryAuthority(['--resolve-quarantines','--environment',scope.environmentId,'--recovery-id',scope.recoveryId,'--expected-revision',String(scope.controlRevision),'--verification-id',proof.id,'--output',join(root,'receipt')]);
  expect(JSON.parse(await readFile(join(root,'receipt/resolution.json'),'utf8'))).toMatchObject({newlyResolved:0,serviceOpened:false,restorationReady:false});
 }finally{await rm(root,{recursive:true,force:true});}
 expect(Number((await owner.query('SELECT count(*) AS n FROM operations_recovery_quarantines')).rows[0].n)).toBe(7);
 for(const table of ['operations_recovery_quarantines','operations_recovery_quarantine_resolutions'])await expect(owner.query('DELETE FROM '+table)).rejects.toThrow('immutable');
 expect((await owner.query('SELECT mode FROM operations_control')).rows[0].mode).toBe('locked');
 expect(await readOperationalHealth()).toMatchObject({recovery:{requiredScopesQuarantined:7}});
 expect((await transitionRecoveryControl(owner,open(scope,proof.bundle))).mode).toBe('open');
 expect(await readOperationalHealth()).toMatchObject({recovery:{requiredScopesQuarantined:0}});
 expect(Number((await owner.query('SELECT count(*) AS n FROM operations_recovery_quarantines')).rows[0].n)).toBe(7);
}),210000);
it('keeps resolved history closed when current state changes before unlock',async()=>fixture(async(owner,_runtime,scope)=>{
 const proof=await verification(owner,scope);await resolveRecoveryQuarantines(owner,{...scope,verificationId:proof.id});
 await owner.query("UPDATE principals SET display_name=display_name || ' synthetic post-resolution change' WHERE id=(SELECT id FROM principals ORDER BY id LIMIT 1)");
 await expect(transitionRecoveryControl(owner,open(scope,proof.bundle))).rejects.toThrow('verified state changed');expect(await count(owner)).toBe(7);expect((await owner.query('SELECT mode FROM operations_control')).rows[0].mode).toBe('locked');
}),210000);
it('rolls back interrupted resolution and retries only with fresh exact proof',async()=>fixture(async(owner,_runtime,scope)=>{
 await owner.query("CREATE FUNCTION pilot_resolution_interrupt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.scope_kind='publications' THEN RAISE EXCEPTION 'Synthetic resolution interruption'; END IF; RETURN NEW; END $$");
 await owner.query('CREATE TRIGGER pilot_resolution_interrupt BEFORE INSERT ON operations_recovery_quarantine_resolutions FOR EACH ROW EXECUTE FUNCTION pilot_resolution_interrupt()');
 const first=await verification(owner,scope);
 await expect(resolveRecoveryQuarantines(owner,{...scope,verificationId:first.id})).rejects.toThrow('Synthetic resolution interruption');expect(await count(owner)).toBe(0);
 await owner.query('DROP TRIGGER pilot_resolution_interrupt ON operations_recovery_quarantine_resolutions');await owner.query('DROP FUNCTION pilot_resolution_interrupt()');
 await expect(resolveRecoveryQuarantines(owner,{...scope,verificationId:first.id})).rejects.toThrow('verified state changed');
 const fresh=await verification(owner,scope);expect(await resolveRecoveryQuarantines(owner,{...scope,verificationId:fresh.id})).toMatchObject({newlyResolved:7,serviceOpened:false});
}),210000);
