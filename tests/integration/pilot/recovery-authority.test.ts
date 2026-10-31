import {it,expect,vi} from 'vitest';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID,randomBytes} from 'node:crypto';
import {Client} from 'pg';
import {withAuthorityEnvironment,coldAuthorityProof,lockAuthorityTarget,authorityCheckpointTime} from '../../fixtures/pilot/recovery-authority';
import {pilotPublishedKnowledgeFixture} from '../../fixtures/pilot/knowledge';
import {reconcileOwnedCredentialDenials} from '../../../lib/server/operations/recovery-credential-denials';
import {quarantineRestoredAuthority,requiredRecoveryQuarantineScopes} from '../../../lib/server/operations/recovery-quarantine';
import {retireOwnedLegacyRuntime} from '../../../lib/server/operations/runtime-retirement';
import {requireOwnedPilotDatabase} from '../../../scripts/pilot-environment';
import {revokeSession,getCurrentSession,sessionCookieName,issueSession} from '../../../lib/server/auth/sessions';
import {authenticateDemoPrincipal} from '../../../lib/server/auth/credentials';
import {createMcpConnection,revokeMcpConnection} from '../../../lib/server/mcp/management';
import {setPartnerGrant} from '../../../lib/server/access/service';
import {DEMO_IDS} from '../../../lib/server/bootstrap-ids';
import {withdrawKnowledge} from '../../../lib/server/knowledge/service';

// These exercise current-authority application against genuinely captured cold
// proof and modeled older mutable target rows. Physical restore is a separate gate.
it('preserves a newer customer grant revocation',async()=>withAuthorityEnvironment(async(owner,_runtime,environmentId)=>{
 const identity=await authenticateDemoPrincipal('mcteer',process.env.TURAS_DEMO_PASSWORD!),issued=await issueSession(identity!),actor=(await getCurrentSession(new Request(process.env.TURAS_APP_ORIGIN!,{headers:{cookie:sessionCookieName()+'='+issued.token}})))!;
 const grant=(await owner.query('SELECT * FROM customer_grants WHERE membership_id=$1 AND customer_id=$2',[DEMO_IDS.partnerMembership,DEMO_IDS.sharedCustomer])).rows[0],backup=await authorityCheckpointTime(owner);
 await setPartnerGrant({actorPrincipalId:actor.principalId,actorSessionId:actor.sessionId,requestKey:randomUUID(),membershipId:grant.membership_id,customerId:grant.customer_id,expectedRevision:Number(grant.revision),state:'revoked'});const proof=await coldAuthorityProof(owner,environmentId);
 await owner.query("UPDATE customer_grants SET state='active',revision=$2 WHERE id=$1",[grant.id,grant.revision]);const scope=await lockAuthorityTarget(owner,environmentId,proof,backup);
 expect(await reconcileOwnedCredentialDenials(owner,proof,scope)).toMatchObject({revokedGrants:1,authorityGranted:false});expect((await owner.query('SELECT state FROM customer_grants WHERE id=$1',[grant.id])).rows[0].state).toBe('revoked');expect(await reconcileOwnedCredentialDenials(owner,proof,scope)).toMatchObject({revokedGrants:0});
}),210000);
it('preserves a newer login session revocation',async()=>withAuthorityEnvironment(async(owner,_runtime,environmentId)=>{
 const f=await pilotPublishedKnowledgeFixture(owner as any,'primary'),backup=await authorityCheckpointTime(owner);await revokeSession(f.actor.sessionId);const proof=await coldAuthorityProof(owner,environmentId);await owner.query('UPDATE login_sessions SET revoked_at=NULL WHERE id=$1',[f.actor.sessionId]);
 expect(await reconcileOwnedCredentialDenials(owner,proof,await lockAuthorityTarget(owner,environmentId,proof,backup))).toMatchObject({revokedSessions:1,quarantineCleared:false});expect(await getCurrentSession(new Request(process.env.TURAS_APP_ORIGIN!,{headers:{cookie:sessionCookieName()+'='+f.actor.token}}),'operations-status')).toBeNull();
}),210000);
it('preserves a newer MCP revocation',async()=>withAuthorityEnvironment(async(owner,_runtime,environmentId)=>{
 const f=await pilotPublishedKnowledgeFixture(owner as any,'primary'),c=await createMcpConnection(f.actor,{requestKey:randomUUID(),name:'Synthetic cold MCP denial',categories:['profiles'],customerIds:[f.customerId],lifetimeDays:1}),backup=await authorityCheckpointTime(owner);await revokeMcpConnection(f.actor,c.connection.id,{requestKey:randomUUID(),expectedConnectionId:c.connection.id});const proof=await coldAuthorityProof(owner,environmentId);
 await owner.query('BEGIN');try{await owner.query('ALTER TABLE mcp_connections DISABLE TRIGGER mcp_connection_identity');await owner.query('UPDATE mcp_connections SET revoked_at=NULL,revoker_membership_id=NULL WHERE id=$1',[c.connection.id]);await owner.query('ALTER TABLE mcp_connections ENABLE TRIGGER mcp_connection_identity');await owner.query('COMMIT');}catch(e){await owner.query('ROLLBACK');throw e;}
 expect(await reconcileOwnedCredentialDenials(owner,proof,await lockAuthorityTarget(owner,environmentId,proof,backup))).toMatchObject({revokedMcpConnections:1});expect((await owner.query('SELECT credential_hash FROM mcp_connections WHERE id=$1',[c.connection.id])).rows[0].credential_hash).toBeNull();
}),210000);
it('preserves a newer source deletion',async()=>withAuthorityEnvironment(async(owner,_runtime,environmentId)=>{
 const f=await pilotPublishedKnowledgeFixture(owner as any,'primary'),{createArtifactStore}=await import('../../../lib/server/artifacts/store-factory'),{createArtifactDatabaseFixture}=await import('../../fixtures/artifact-database'),{retireArtifactVersion}=await import('../../../lib/server/artifacts/lifecycle'),bytes=Buffer.from('Synthetic old source bytes before deletion'),store=createArtifactStore();
 const staged=await store.stage((async function*(){yield bytes;})(),bytes.length),key=await store.finalize(staged.key,staged.digest);await owner.query('BEGIN');let artifact:Awaited<ReturnType<typeof createArtifactDatabaseFixture>>;try{artifact=await createArtifactDatabaseFixture(owner as any,f.actor,f.customerId,null,bytes,key);await owner.query('COMMIT');}catch(e){await owner.query('ROLLBACK');throw e;}
 await owner.query("UPDATE artifact_extraction_runs SET state='published',scan_receipt='{}',coverage='{\"total\":1,\"visited\":1,\"omitted\":[]}',manifest_digest=$2,published_at=now() WHERE id=$1",[artifact.runId,artifact.originalDigest]);await owner.query("UPDATE artifact_versions SET state='processing' WHERE id=$1",[artifact.versionId]);await owner.query("UPDATE artifact_versions SET state='ready' WHERE id=$1",[artifact.versionId]);
 const backup=await authorityCheckpointTime(owner);await retireArtifactVersion(f.actor,artifact.versionId,{action:'delete',expectedGeneration:1,reason:'Synthetic newer source deletion',idempotencyKey:randomUUID()});const proof=await coldAuthorityProof(owner,environmentId);expect(await store.readPath(key)).toBeTruthy();
 await owner.query('BEGIN');try{await owner.query('ALTER TABLE artifact_versions DISABLE TRIGGER artifact_lifecycle_transition');await owner.query("UPDATE artifact_versions SET state='ready',lifecycle_generation=1 WHERE id=$1",[artifact.versionId]);await owner.query('ALTER TABLE artifact_versions ENABLE TRIGGER artifact_lifecycle_transition');await owner.query('COMMIT');}catch(e){await owner.query('ROLLBACK');throw e;}
 expect(await reconcileOwnedCredentialDenials(owner,proof,await lockAuthorityTarget(owner,environmentId,proof,backup))).toMatchObject({withdrawnArtifacts:1});expect((await owner.query('SELECT state FROM artifact_versions WHERE id=$1',[artifact.versionId])).rows[0].state).toBe('withdrawn');expect(await store.readPath(key)).toBeTruthy();expect((await owner.query("SELECT count(*)::int AS n FROM operations_source_denials WHERE source_kind='artifact_version' AND source_id=$1",[artifact.versionId])).rows[0].n).toBe(1);
}),210000);
it('invalidates a newer publication withdrawal',async()=>withAuthorityEnvironment(async(owner,_runtime,environmentId)=>{
 const f=await pilotPublishedKnowledgeFixture(owner as any,'primary'),backup=await authorityCheckpointTime(owner);await owner.query('BEGIN');try{await withdrawKnowledge(owner as any,f.actor,f.publicationId,{idempotencyKey:randomUUID(),expectedRevision:1,expectedDigest:f.digest,expectedPublicationGeneration:f.generation,rationale:'Synthetic reviewed publication withdrawal'});await owner.query('COMMIT');}catch(e){await owner.query('ROLLBACK');throw e;}
 const proof=await coldAuthorityProof(owner,environmentId);await owner.query("UPDATE knowledge_publications SET state='published',head_generation=$2 WHERE id=$1",[f.publicationId,f.generation]);expect(await reconcileOwnedCredentialDenials(owner,proof,await lockAuthorityTarget(owner,environmentId,proof,backup))).toMatchObject({suspendedPublications:1});expect((await owner.query('SELECT state FROM knowledge_publications WHERE id=$1',[f.publicationId])).rows[0].state).toBe('suspended');expect((await owner.query('SELECT count(*)::int AS n FROM knowledge_revision_payloads WHERE revision_id=$1',[f.revisionId])).rows[0].n).toBe(1);
}),210000);
it('preserves permanent replay receipts',async()=>withAuthorityEnvironment(async(owner,runtime,environmentId)=>{
 const f=await pilotPublishedKnowledgeFixture(owner as any,'primary'),key=randomUUID(),c=await createMcpConnection(f.actor,{requestKey:key,name:'Synthetic recovered permanent key',categories:['profiles'],customerIds:[f.customerId],lifetimeDays:1}),backup=await authorityCheckpointTime(owner),receipt=(await owner.query('SELECT * FROM mcp_management_receipts WHERE request_key=$1',[key])).rows[0],proof=await coldAuthorityProof(owner,environmentId);
 await owner.query('BEGIN');try{await owner.query('ALTER TABLE mcp_management_receipts DISABLE TRIGGER mcp_management_immutable');await owner.query('DELETE FROM mcp_management_receipts WHERE request_key=$1',[key]);await owner.query('ALTER TABLE mcp_management_receipts ENABLE TRIGGER mcp_management_immutable');await owner.query('COMMIT');}catch(e){await owner.query('ROLLBACK');throw e;}
 const result=await reconcileOwnedCredentialDenials(owner,proof,await lockAuthorityTarget(owner,environmentId,proof,backup));expect(result.permanentReplayFencesAdded).toBeGreaterThan(0);
 await expect(runtime.query('INSERT INTO mcp_management_receipts(request_key,environment_id,workspace_id,actor_membership_id,connection_id,action,request_digest) VALUES($1,$2,$3,$4,$5,$6,$7)',[key,environmentId,receipt.workspace_id,receipt.actor_membership_id,c.connection.id,receipt.action,receipt.request_digest])).rejects.toThrow('Recovered permanent request cannot be repeated');await expect(owner.query('DELETE FROM operations_replay_fences')).rejects.toThrow('immutable');
}),210000);
it('denies an old deployment session bypass',async()=>withAuthorityEnvironment(async(owner,runtime,environmentId,owned)=>{
 const f=await pilotPublishedKnowledgeFixture(owner as any,'primary'),{hashSessionToken}=await import('../../../lib/server/auth/sessions'),old=requireOwnedPilotDatabase(),scope=await lockAuthorityTarget(owner,environmentId),oldAuth="SELECT s.id FROM login_sessions s JOIN principals p ON p.id=s.principal_id JOIN memberships m ON m.principal_id=p.id WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp() AND p.active AND m.active",tokenHash=hashSessionToken(f.actor.token);expect((await runtime.query(oldAuth,[tokenHash])).rows.some(row=>row.id===f.actor.sessionId)).toBe(true);
 // Delay this exact owned backend's exit. A signal acknowledgment alone must
 // not count as retirement. All SQL still executes against the real database.
 const pid=(await runtime.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
 expect(Number.isInteger(pid)&&pid>0).toBe(true);
 const signal=(name:string)=>promisify(execFile)('docker',['exec',owned.databaseContainer,'sh','-c','kill -'+name+' "$1"','sh',String(pid)],{timeout:5000,maxBuffer:8192});
 await signal('STOP');let resumed:Promise<unknown>|undefined;
 const original=owner.query.bind(owner),observed=vi.spyOn(owner,'query').mockImplementation(((...args:any[])=>{
  if(typeof args[0]==='string'&&args[0].includes('SELECT pg_terminate_backend')&&!resumed)
   resumed=new Promise(resolve=>setTimeout(resolve,250)).then(()=>signal('CONT'));
  return (original as (...args:any[])=>any)(...args);
 }) as typeof owner.query);
 try{expect(await retireOwnedLegacyRuntime(owner,{environmentId,recoveryId:scope.recoveryId,controlRevision:scope.controlRevision,password:randomBytes(32).toString('base64url')})).toMatchObject({oldLoginDisabled:true,oldBackendsTerminated:true});}
 finally{observed.mockRestore();if(resumed)await resumed;else await signal('CONT');}
 await expect(runtime.query(oldAuth,[tokenHash])).rejects.toThrow();const reconnect=new Client({connectionString:old});try{await expect(reconnect.connect()).rejects.toMatchObject({code:'28000'});}finally{await reconnect.end();}
}),210000);
it('quarantines absent current authority proof',async()=>withAuthorityEnvironment(async(owner,runtime,environmentId)=>{
 const scope=await lockAuthorityTarget(owner,environmentId),result=await quarantineRestoredAuthority(owner,{environmentId,recoveryId:scope.recoveryId,controlRevision:scope.controlRevision});expect(result).toMatchObject({currentAuthorityVerified:false,restorationReady:false});expect(result.quarantinedScopes).toEqual([...requiredRecoveryQuarantineScopes].sort());await expect(owner.query("UPDATE operations_control SET mode='open' WHERE environment_id=$1",[environmentId])).rejects.toThrow('quarantined');await expect(runtime.query('DELETE FROM operations_recovery_quarantines')).rejects.toThrow('permission denied');expect((await owner.query('SELECT count(*)::int AS n FROM login_sessions WHERE revoked_at IS NULL')).rows[0].n).toBe(0);
}),210000);
