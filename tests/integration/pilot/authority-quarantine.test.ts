import {beforeEach,afterEach,it,expect} from 'vitest';
import {Client} from 'pg';
import {randomUUID} from 'node:crypto';
import {mkdir,mkdtemp,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {requireOwnedPilotDatabase} from '../../../scripts/pilot-environment';
import {quarantineRestoredAuthority} from '../../../lib/server/operations/recovery-quarantine';
import {pilotRecoveryAuthority} from '../../../scripts/pilot-recovery-authority';
import {authenticateDemoPrincipal} from '../../../lib/server/auth/credentials';
import {issueSession,getCurrentSession,sessionCookieName,type CurrentSession} from '../../../lib/server/auth/sessions';
import {createMcpConnection} from '../../../lib/server/mcp/management';
import {setPartnerGrant} from '../../../lib/server/access/service';
import {closeRuntimePool} from '../../../lib/server/db/client';
import {DEMO_IDS} from '../../../lib/server/bootstrap-ids';
import {recoveryDigest} from '../../../lib/contracts/pilot-recovery';
import {openOwnedPilotSuite} from '../../fixtures/pilot/environment';
let owner:Client,runtime:Client,environmentId:string,owned:Awaited<ReturnType<typeof openOwnedPilotSuite>>;
let actor:CurrentSession,connectionId:string,recoveryId:string,revision:number;
const scope=()=>({environmentId,recoveryId,controlRevision:revision});
const statusRequest=()=>new Request(process.env.TURAS_APP_ORIGIN!+'/api/operations/status',{headers:{cookie:sessionCookieName()+'='+actor.token}});
afterEach(async()=>{try{await runtime?.end();await owner?.end();await closeRuntimePool();}finally{await owned?.close();}});
beforeEach(async()=>{
 owned=await openOwnedPilotSuite({postgresMajor:18,deadlineMs:120000});environmentId=owned.environment.environmentId;owner=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)});runtime=new Client({connectionString:requireOwnedPilotDatabase()});await owner.connect();await runtime.connect();
 const identity=await authenticateDemoPrincipal('mcteer',process.env.TURAS_DEMO_PASSWORD!);const issued=await issueSession(identity!);actor=(await getCurrentSession(new Request(process.env.TURAS_APP_ORIGIN!,{headers:{cookie:sessionCookieName()+'='+issued.token}})))!;
 const membership=(await owner.query('SELECT id FROM memberships WHERE principal_id=$1 AND workspace_id=$2',[DEMO_IDS.partner,actor.workspaceId])).rows[0];
 const grant=(await owner.query('SELECT revision FROM customer_grants WHERE membership_id=$1 AND customer_id=$2',[membership.id,DEMO_IDS.sharedCustomer])).rows[0];
 await setPartnerGrant({actorPrincipalId:actor.principalId,actorSessionId:actor.sessionId,requestKey:randomUUID(),membershipId:membership.id,customerId:DEMO_IDS.sharedCustomer,expectedRevision:Number(grant?.revision??0),state:'active'});
 const connection=await createMcpConnection(actor,{requestKey:randomUUID(),name:'Synthetic quarantine connection',categories:['profiles'],customerIds:[DEMO_IDS.sharedCustomer],lifetimeDays:1});connectionId=connection.connection.id;
 recoveryId=randomUUID();revision=Number((await owner.query("UPDATE operations_control SET mode='locked',recovery_id=$2,revision=revision+1 WHERE environment_id=$1 RETURNING revision",[environmentId,recoveryId])).rows[0].revision);
});
it('denies runtime authority quarantine even with a claimed scope',async()=>{await expect(quarantineRestoredAuthority(runtime,scope())).rejects.toThrow('actual owner');expect((await owner.query('SELECT revoked_at FROM login_sessions WHERE id=$1',[actor.sessionId])).rows[0].revoked_at).toBeNull();});
it('revokes restored sessions MCP credentials and partner grants before any unlock',async()=>{
 expect(await getCurrentSession(statusRequest(),'operations-status')).not.toBeNull();
 const result=await quarantineRestoredAuthority(owner,scope());expect(result).toMatchObject({mode:'locked',currentAuthorityVerified:false,restorationReady:false,allRequiredScopesQuarantined:true});expect(result.newlyRevokedSessions).toBeGreaterThan(0);expect(result.newlyRevokedMcpConnections).toBeGreaterThan(0);expect(result.newlyRevokedGrants).toBeGreaterThan(0);
 expect(await getCurrentSession(statusRequest(),'operations-status')).toBeNull();
 expect((await owner.query('SELECT revoked_at,credential_hash FROM mcp_connections WHERE id=$1',[connectionId])).rows[0]).toMatchObject({revoked_at:null,credential_hash:null});expect((await owner.query("SELECT count(*)::int AS n FROM customer_grants WHERE state='active'")).rows[0].n).toBe(0);
});
it('rejects a wrong environment revision or recovery identity without revoking credentials',async()=>{
 for(const input of [{...scope(),environmentId:'foreign'}, {...scope(),controlRevision:revision-1},{...scope(),recoveryId:randomUUID()}])await expect(quarantineRestoredAuthority(owner,input)).rejects.toThrow();
 expect((await owner.query('SELECT revoked_at FROM login_sessions WHERE id=$1',[actor.sessionId])).rows[0].revoked_at).toBeNull();expect((await owner.query('SELECT credential_hash FROM mcp_connections WHERE id=$1',[connectionId])).rows[0].credential_hash).not.toBeNull();
});
it('repeats quarantine without extending revisions expiries or retained denials',async()=>{
 const first=await quarantineRestoredAuthority(owner,scope());expect(first.newlyRevokedGrants).toBeGreaterThan(0);
 const before=recoveryDigest((await owner.query('SELECT to_jsonb(g) AS value FROM customer_grants g ORDER BY id')).rows);
 const second=await quarantineRestoredAuthority(owner,scope());expect(second).toMatchObject({newlyRevokedSessions:0,newlyRevokedMcpConnections:0,newlyRevokedGrants:0});expect(recoveryDigest((await owner.query('SELECT to_jsonb(g) AS value FROM customer_grants g ORDER BY id')).rows)).toBe(before);expect((await owner.query('SELECT mode,revision FROM operations_control')).rows[0]).toMatchObject({mode:'locked',revision:String(revision)});
});
it('records an actual owner quarantine while retaining captured histories and replay receipts',async()=>{
 const history=async()=>recoveryDigest({profiles:(await owner.query('SELECT to_jsonb(r) AS value FROM profile_revisions r ORDER BY id')).rows,commands:(await owner.query('SELECT to_jsonb(c) AS value FROM admin_commands c ORDER BY id')).rows,receipts:(await owner.query('SELECT to_jsonb(r) AS value FROM mcp_management_receipts r ORDER BY environment_id,workspace_id,actor_membership_id,request_key')).rows});const before=await history();
 await mkdir(resolve('local-artifacts/016'),{recursive:true,mode:0o700});const root=await mkdtemp(resolve('local-artifacts/016/quarantine-command-'));
 try{const result=await pilotRecoveryAuthority(['--quarantine','--environment',environmentId,'--recovery-id',recoveryId,'--expected-revision',String(revision),'--output',join(root,'record')]);expect(result).toMatchObject({capturedHistoriesRetained:true,permanentReplayProofAvailable:false,restorationReady:false,paidCalls:0});expect(await history()).toBe(before);}finally{await rm(root,{recursive:true,force:true});}
});
