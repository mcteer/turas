import {it,expect} from 'vitest';
import {auditRecoveredRequestFences} from '../../../lib/server/operations/recovery-replay-audit';
import {authorityCheckpointTime} from '../../fixtures/pilot/recovery-authority';
import {Client} from 'pg';
import {randomUUID} from 'node:crypto';
import {withPilotEnvironment,requireOwnedPilotDatabase} from '../../../scripts/pilot-environment';
import {captureRecoveryDenialSnapshot} from '../../../lib/server/operations/recovery-denial-snapshot';
import {reconcileOwnedCredentialDenials} from '../../../lib/server/operations/recovery-credential-denials';
import {pilotPublishedKnowledgeFixture} from '../../fixtures/pilot/knowledge';
import {createMcpConnection,revokeMcpConnection} from '../../../lib/server/mcp/management';
import {revokeSession,getCurrentSession,sessionCookieName} from '../../../lib/server/auth/sessions';
import {setPartnerGrant} from '../../../lib/server/access/service';
import {DEMO_IDS} from '../../../lib/server/bootstrap-ids';
async function fixture(run:(owner:Client,runtime:Client,environmentId:string)=>Promise<void>){await withPilotEnvironment(async env=>{const owner=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)}),runtime=new Client({connectionString:requireOwnedPilotDatabase()});await owner.connect();await runtime.connect();try{await run(owner,runtime,env.environmentId);}finally{await runtime.end();await owner.end();}},{postgresMajor:18,deadlineMs:180000});}
async function lock(owner:Client,environmentId:string,snapshot:Awaited<ReturnType<typeof captureRecoveryDenialSnapshot>>,backupCapturedAt:string){const recoveryId=randomUUID(),revision=(await owner.query("UPDATE operations_control SET mode='locked',revision=revision+1,recovery_id=$2 WHERE environment_id=$1 RETURNING revision",[environmentId,recoveryId])).rows[0].revision;return {environmentId,recoveryId,controlRevision:Number(revision),snapshotDigest:snapshot.snapshotDigest,backupCapturedAt};}
it('preserves ordinary nullable unique identities while fencing concrete recovered request keys',async()=>fixture(async(owner,runtime,environmentId)=>{
 await owner.query("CREATE TABLE pilot_nullable_replay_attempts(id uuid PRIMARY KEY,environment_id text NOT NULL,request_key uuid UNIQUE,state text NOT NULL DEFAULT 'prepared')");
 await owner.query("CREATE TRIGGER recovered_request_replay BEFORE INSERT OR UPDATE ON pilot_nullable_replay_attempts FOR EACH ROW EXECUTE FUNCTION turas_recovery_replay_guard()");
 await owner.query('GRANT SELECT,INSERT,UPDATE ON pilot_nullable_replay_attempts TO turas_runtime');
 const concrete=randomUUID(),oldId=randomUUID(),backup=await authorityCheckpointTime(owner);
 await owner.query('INSERT INTO pilot_nullable_replay_attempts(id,environment_id,request_key) VALUES($1,$2,NULL),($3,$2,$4)',[randomUUID(),environmentId,oldId,concrete]);
 const snapshot=await captureRecoveryDenialSnapshot(owner,environmentId,AbortSignal.timeout(60000)),scope=await lock(owner,environmentId,snapshot,backup);
 await expect(auditRecoveredRequestFences(owner,snapshot,scope)).rejects.toThrow('request fence missing');
 await reconcileOwnedCredentialDenials(owner,snapshot,scope);
 expect(await auditRecoveredRequestFences(owner,snapshot,scope)).toMatchObject({permanentRequestFencesVerified:true,currentAuthorityVerified:false,replayReconciled:false,quarantineCleared:false,providerCalls:0});
 await owner.query('ALTER TABLE operations_replay_fences DISABLE TRIGGER replay_fence_immutable');
 await expect(auditRecoveredRequestFences(owner,snapshot,scope)).rejects.toThrow('fence immutability unavailable');
 await owner.query('ALTER TABLE operations_replay_fences ENABLE TRIGGER replay_fence_immutable');
 const originalFunction=(await owner.query("SELECT pg_get_functiondef('public.turas_recovery_replay_guard()'::regprocedure) AS definition")).rows[0].definition;
 await owner.query("CREATE OR REPLACE FUNCTION public.turas_recovery_replay_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ BEGIN RETURN NEW; END $$");
 await expect(auditRecoveredRequestFences(owner,snapshot,scope)).rejects.toThrow('request function differs');
 await owner.query(originalFunction);
 await owner.query('ALTER TABLE pilot_nullable_replay_attempts DISABLE TRIGGER recovered_request_replay');
 await expect(auditRecoveredRequestFences(owner,snapshot,scope)).rejects.toThrow('request guard unavailable');
 await owner.query('ALTER TABLE pilot_nullable_replay_attempts ENABLE TRIGGER recovered_request_replay');
 await expect(auditRecoveredRequestFences(runtime,snapshot,scope)).rejects.toThrow('actual owner');
 await expect(auditRecoveredRequestFences(owner,snapshot,{...scope,controlRevision:scope.controlRevision+1})).rejects.toThrow('Exact locked');
 await runtime.query('INSERT INTO pilot_nullable_replay_attempts(id,environment_id,request_key) VALUES($1,$2,NULL),($3,$2,NULL)',[randomUUID(),environmentId,randomUUID()]);
 await expect(runtime.query('INSERT INTO pilot_nullable_replay_attempts(id,environment_id,request_key) VALUES($1,$2,$3)',[randomUUID(),environmentId,concrete])).rejects.toThrow('Recovered permanent request');
 await expect(runtime.query("UPDATE pilot_nullable_replay_attempts SET state='running' WHERE id=$1",[oldId])).rejects.toThrow('Recovered permanent request');
}),210000);
it('blocks runtime updates of recovered requests while allowing locked owner retirement and unfenced new work',async()=>fixture(async(owner,runtime,environmentId)=>{
 const f=await pilotPublishedKnowledgeFixture(owner as any,'primary'),conversation=randomUUID(),request=randomUUID(),backup=await authorityCheckpointTime(owner);
 await owner.query("INSERT INTO conversations(id,environment_id,workspace_id,customer_id,owner_principal_id,creation_operation_id,binding_state,title) VALUES($1,$2,$3,$4,$5,$6,'unbound','Synthetic recovered request')",[conversation,environmentId,f.actor.workspaceId,f.customerId,f.actor.principalId,randomUUID()]);
 const insert="INSERT INTO research_requests(id,environment_id,workspace_id,customer_id,actor_membership_id,actor_principal_id,login_session_id,conversation_id,mode,public_fields,idempotency_key,request_digest) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'fit','{}',$9,$10)";
 const values=(id:string,key:string)=>[id,environmentId,f.actor.workspaceId,f.customerId,f.actor.membershipId,f.actor.principalId,f.actor.sessionId,conversation,key,'a'.repeat(64)];
 await owner.query(insert,values(request,'recovered-request'));
 const snapshot=await captureRecoveryDenialSnapshot(owner,environmentId,AbortSignal.timeout(60000)),scope=await lock(owner,environmentId,snapshot,backup);await reconcileOwnedCredentialDenials(owner,snapshot,scope);
 await expect(runtime.query("UPDATE research_requests SET state='cancelled' WHERE id=$1",[request])).rejects.toThrow('Recovered permanent request');
 await owner.query("UPDATE research_requests SET state='cancelled' WHERE id=$1",[request]);
 expect((await owner.query('SELECT state FROM research_requests WHERE id=$1',[request])).rows[0].state).toBe('cancelled');
 const fresh=randomUUID();await runtime.query(insert,values(fresh,'genuinely-new-request'));await runtime.query("UPDATE research_requests SET state='cancelled' WHERE id=$1",[fresh]);
 const mailGuard=(await owner.query("SELECT tgtype::int AS type FROM pg_trigger WHERE tgrelid='report_deliveries'::regclass AND tgname='recovered_request_replay'")).rows[0];expect(mailGuard.type&4).toBe(4);expect(mailGuard.type&16).toBe(16);
}),210000);
it('reapplies newer session denial and leaves unaffected current credentials unchanged',async()=>fixture(async(owner,_runtime,environmentId)=>{
 const f=await pilotPublishedKnowledgeFixture(owner as any,'primary'),other=await pilotPublishedKnowledgeFixture(owner as any,'primary'),backup=await authorityCheckpointTime(owner);await revokeSession(f.actor.sessionId);
 const snapshot=await captureRecoveryDenialSnapshot(owner,environmentId,AbortSignal.timeout(60000));
 // Isolated owner fixture models the old captured row; this is not a full
 // database restore claim and never changes an operator/Production source.
 await owner.query('UPDATE login_sessions SET revoked_at=NULL WHERE id=$1',[f.actor.sessionId]);
 const before=(await owner.query('SELECT * FROM login_sessions WHERE id=$1',[other.actor.sessionId])).rows[0],scope=await lock(owner,environmentId,snapshot,backup);
 expect(await reconcileOwnedCredentialDenials(owner,snapshot,scope)).toMatchObject({mode:'locked',revokedSessions:1,authorityGranted:false,quarantineCleared:false,currentAuthorityVerified:false});
 expect((await owner.query('SELECT * FROM login_sessions WHERE id=$1',[other.actor.sessionId])).rows[0]).toEqual(before);
 const denied=(await owner.query('SELECT revoked_at FROM login_sessions WHERE id=$1',[f.actor.sessionId])).rows[0];expect(denied.revoked_at).toBeInstanceOf(Date);
 expect(await reconcileOwnedCredentialDenials(owner,snapshot,scope)).toMatchObject({revokedSessions:0});expect((await owner.query('SELECT revoked_at FROM login_sessions WHERE id=$1',[f.actor.sessionId])).rows[0]).toEqual(denied);
 expect(await getCurrentSession(new Request(process.env.TURAS_APP_ORIGIN+'/api/operations/status',{headers:{cookie:sessionCookieName()+'='+f.actor.token}}),'operations-status')).toBeNull();
}),210000);
it('reapplies newer MCP denial without manufacturing a human revocation or replaying management',async()=>fixture(async(owner,_runtime,environmentId)=>{
 const f=await pilotPublishedKnowledgeFixture(owner as any,'primary'),connection=await createMcpConnection(f.actor,{requestKey:randomUUID(),name:'Synthetic independently current denial',categories:['profiles'],customerIds:[f.customerId],lifetimeDays:1}),backup=await authorityCheckpointTime(owner);
 const original=(await owner.query('SELECT credential_hash FROM mcp_connections WHERE id=$1',[connection.connection.id])).rows[0].credential_hash;
 await revokeMcpConnection(f.actor,connection.connection.id,{requestKey:randomUUID(),expectedConnectionId:connection.connection.id});const snapshot=await captureRecoveryDenialSnapshot(owner,environmentId,AbortSignal.timeout(60000));
 const receipts=(await owner.query('SELECT * FROM mcp_management_receipts WHERE connection_id=$1 ORDER BY action',[connection.connection.id])).rows;
 await owner.query('BEGIN');try{await owner.query('ALTER TABLE mcp_connections DISABLE TRIGGER mcp_connection_identity');await owner.query('UPDATE mcp_connections SET revoked_at=NULL,revoker_membership_id=NULL,credential_hash=$2 WHERE id=$1',[connection.connection.id,original]);await owner.query('ALTER TABLE mcp_connections ENABLE TRIGGER mcp_connection_identity');await owner.query('COMMIT');}catch(error){await owner.query('ROLLBACK');throw error;}
 const scope=await lock(owner,environmentId,snapshot,backup);expect(await reconcileOwnedCredentialDenials(owner,snapshot,scope)).toMatchObject({revokedMcpConnections:1,currentAuthorityVerified:false});
 expect((await owner.query('SELECT credential_hash,revoked_at,revoker_membership_id FROM mcp_connections WHERE id=$1',[connection.connection.id])).rows[0]).toEqual({credential_hash:null,revoked_at:null,revoker_membership_id:null});
 expect((await owner.query('SELECT * FROM mcp_management_receipts WHERE connection_id=$1 ORDER BY action',[connection.connection.id])).rows).toEqual(receipts);
}),210000);
it('reapplies newer partner grant denial and invalidates delivery generation without reviving grants',async()=>fixture(async(owner,_runtime,environmentId)=>{
 const {authenticateDemoPrincipal}=await import('../../../lib/server/auth/credentials');const {issueSession}=await import('../../../lib/server/auth/sessions');
 const identity=await authenticateDemoPrincipal('mcteer',process.env.TURAS_DEMO_PASSWORD!),issued=await issueSession(identity!);const actor=(await getCurrentSession(new Request(process.env.TURAS_APP_ORIGIN!,{headers:{cookie:sessionCookieName()+'='+issued.token}})))!;
 const grant=(await owner.query('SELECT * FROM customer_grants WHERE membership_id=$1 AND customer_id=$2',[DEMO_IDS.partnerMembership,DEMO_IDS.sharedCustomer])).rows[0],backup=await authorityCheckpointTime(owner);
 await setPartnerGrant({actorPrincipalId:actor.principalId,actorSessionId:actor.sessionId,requestKey:randomUUID(),membershipId:grant.membership_id,customerId:grant.customer_id,expectedRevision:Number(grant.revision),state:'revoked'});const snapshot=await captureRecoveryDenialSnapshot(owner,environmentId,AbortSignal.timeout(60000));
 await owner.query("UPDATE customer_grants SET state='active',revision=$2 WHERE id=$1",[grant.id,grant.revision]);const generation=Number((await owner.query('SELECT delivery_generation FROM customer_profile_state WHERE customer_id=$1',[grant.customer_id])).rows[0].delivery_generation);
 const scope=await lock(owner,environmentId,snapshot,backup);expect(await reconcileOwnedCredentialDenials(owner,snapshot,scope)).toMatchObject({revokedGrants:1});expect((await owner.query('SELECT state FROM customer_grants WHERE id=$1',[grant.id])).rows[0].state).toBe('revoked');expect(Number((await owner.query('SELECT delivery_generation FROM customer_profile_state WHERE customer_id=$1',[grant.customer_id])).rows[0].delivery_generation)).toBe(generation+1);
 expect(await reconcileOwnedCredentialDenials(owner,snapshot,scope)).toMatchObject({revokedGrants:0});
}),210000);
it('denies foreign stale runtime and changed credential reconciliation before any mutation',async()=>fixture(async(owner,runtime,environmentId)=>{
 const f=await pilotPublishedKnowledgeFixture(owner as any,'primary'),backup=await authorityCheckpointTime(owner),snapshot=await captureRecoveryDenialSnapshot(owner,environmentId,AbortSignal.timeout(60000)),scope=await lock(owner,environmentId,snapshot,backup),before=(await owner.query('SELECT * FROM login_sessions WHERE id=$1',[f.actor.sessionId])).rows[0];
 await expect(reconcileOwnedCredentialDenials(runtime,snapshot,scope)).rejects.toThrow('owned isolated');await expect(reconcileOwnedCredentialDenials(owner,snapshot,{...scope,controlRevision:scope.controlRevision+1})).rejects.toThrow('locked');await expect(reconcileOwnedCredentialDenials(owner,snapshot,{...scope,environmentId:'foreign'})).rejects.toThrow('target differs');await expect(reconcileOwnedCredentialDenials(owner,snapshot,{...scope,backupCapturedAt:new Date(Date.parse(snapshot.capturedAt)+1).toISOString()})).rejects.toThrow('Fresh independent');await expect(reconcileOwnedCredentialDenials(owner,{...snapshot,tables:snapshot.tables.slice(1)},scope)).rejects.toThrow('Fresh independent');
 expect((await owner.query('SELECT * FROM login_sessions WHERE id=$1',[f.actor.sessionId])).rows[0]).toEqual(before);
}),210000);
it('denies restored administrator credentials after a newer membership downgrade',async()=>fixture(async(owner,_runtime,environmentId)=>{
 const f=await pilotPublishedKnowledgeFixture(owner as any,'primary'),connection=await createMcpConnection(f.actor,{requestKey:randomUUID(),name:'Synthetic downgraded authority',categories:['profiles'],customerIds:[f.customerId],lifetimeDays:1}),backup=await authorityCheckpointTime(owner);
 await owner.query("UPDATE memberships SET role='member',revision=revision+1 WHERE id=$1",[f.actor.membershipId]);const snapshot=await captureRecoveryDenialSnapshot(owner,environmentId,AbortSignal.timeout(60000));
 await owner.query("UPDATE memberships SET role='admin' WHERE id=$1",[f.actor.membershipId]);const scope=await lock(owner,environmentId,snapshot,backup);
 expect(await reconcileOwnedCredentialDenials(owner,snapshot,scope)).toMatchObject({revokedSessions:1,revokedMcpConnections:1,authorityGranted:false,quarantineCleared:false});
 expect((await owner.query('SELECT credential_hash FROM mcp_connections WHERE id=$1',[connection.connection.id])).rows[0].credential_hash).toBeNull();expect((await owner.query('SELECT mode FROM operations_control')).rows[0].mode).toBe('locked');
}),210000);
it('denies post-proof unknown credentials without extending expiration or accepted history',async()=>fixture(async(owner,_runtime,environmentId)=>{
 const f=await pilotPublishedKnowledgeFixture(owner as any,'primary'),backup=await authorityCheckpointTime(owner),snapshot=await captureRecoveryDenialSnapshot(owner,environmentId,AbortSignal.timeout(60000));
 const {issueSession}=await import('../../../lib/server/auth/sessions');const unknown=await issueSession(f.actor),hash=(await import('../../../lib/server/auth/sessions')).hashSessionToken(unknown.token),session=(await owner.query('SELECT id,expires_at FROM login_sessions WHERE token_hash=$1',[hash])).rows[0];
 const connection=await createMcpConnection(f.actor,{requestKey:randomUUID(),name:'Synthetic absent current proof',categories:['profiles'],customerIds:[f.customerId],lifetimeDays:1});const original=(await owner.query('SELECT payload,content_digest FROM profile_revisions WHERE id=$1',[f.originalRevisionId])).rows[0];const scope=await lock(owner,environmentId,snapshot,backup);
 expect(await reconcileOwnedCredentialDenials(owner,snapshot,scope)).toMatchObject({revokedSessions:1,revokedMcpConnections:1,restorationReady:false});
 expect((await owner.query('SELECT revoked_at,expires_at FROM login_sessions WHERE id=$1',[session.id])).rows[0]).toMatchObject({revoked_at:expect.any(Date),expires_at:session.expires_at});expect((await owner.query('SELECT payload,content_digest FROM profile_revisions WHERE id=$1',[f.originalRevisionId])).rows[0]).toEqual(original);expect((await owner.query('SELECT credential_hash FROM mcp_connections WHERE id=$1',[connection.connection.id])).rows[0].credential_hash).toBeNull();
}),210000);
it('retires restored projections and suspends newer withdrawn publications without changing accepted history',async()=>fixture(async(owner,_runtime,environmentId)=>{
 const f=await pilotPublishedKnowledgeFixture(owner as any,'primary'),projectionId=randomUUID(),digest='a'.repeat(64);
 await owner.query("INSERT INTO retrieval_sources(id,environment_id,scope,source_kind,source_revision_id,audience,projection_contract,contract_digest,source_generation,content_digest) VALUES($1,$2,'shared','published_shared',$3,'shared','retrieval-v1',$4,$5,$4)",[projectionId,environmentId,f.revisionId,digest,f.generation]);
 const original=(await owner.query('SELECT payload,content_digest FROM profile_revisions WHERE id=$1',[f.originalRevisionId])).rows[0],backup=await authorityCheckpointTime(owner);
 await owner.query("UPDATE knowledge_publications SET state='withdrawn',head_generation=head_generation+1 WHERE id=$1",[f.publicationId]);await owner.query("UPDATE retrieval_sources SET lifecycle_state='retired' WHERE id=$1",[projectionId]);
 const snapshot=await captureRecoveryDenialSnapshot(owner,environmentId,AbortSignal.timeout(60000));
 // Model only old mutable heads in this owned fixture; preserve all decisions.
 await owner.query("UPDATE knowledge_publications SET state='published',head_generation=$2 WHERE id=$1",[f.publicationId,f.generation]);await owner.query("UPDATE retrieval_sources SET lifecycle_state='current' WHERE id=$1",[projectionId]);
 const scope=await lock(owner,environmentId,snapshot,backup);expect(await reconcileOwnedCredentialDenials(owner,snapshot,scope)).toMatchObject({retiredProjections:2,suspendedPublications:1,sourcePublicationDenialsApplied:true,quarantineCleared:false,restorationReady:false});
 expect((await owner.query('SELECT state FROM knowledge_publications WHERE id=$1',[f.publicationId])).rows[0].state).toBe('suspended');expect((await owner.query('SELECT lifecycle_state FROM retrieval_sources WHERE id=$1',[projectionId])).rows[0].lifecycle_state).toBe('retired');expect((await owner.query('SELECT payload,content_digest FROM profile_revisions WHERE id=$1',[f.originalRevisionId])).rows[0]).toEqual(original);
 expect(await reconcileOwnedCredentialDenials(owner,snapshot,scope)).toMatchObject({retiredProjections:0,suspendedPublications:0});expect((await owner.query('SELECT mode FROM operations_control')).rows[0].mode).toBe('locked');
}),210000);
it('retires an old profile projection when current accepted-head proof denies it before cleanup',async()=>fixture(async(owner,_runtime,environmentId)=>{
 const f=await pilotPublishedKnowledgeFixture(owner as any,'primary'),projectionId=randomUUID(),digest='b'.repeat(64),record=(await owner.query('SELECT record_id,revision_number FROM profile_revisions WHERE id=$1',[f.originalRevisionId])).rows[0];
 await owner.query("INSERT INTO retrieval_sources(id,environment_id,workspace_id,customer_id,scope,source_kind,source_revision_id,audience,projection_contract,contract_digest,source_generation,content_digest) VALUES($1,$2,$3,$4,'customer','accepted_profile',$5,'delivery','retrieval-v1',$6,$7,$6)",[projectionId,environmentId,f.actor.workspaceId,f.customerId,f.originalRevisionId,digest,Number(record.revision_number)]);
 const backup=await authorityCheckpointTime(owner),version=Number((await owner.query('SELECT version FROM profile_records WHERE id=$1',[record.record_id])).rows[0].version),{submitProfileCommand}=await import('../../../lib/server/profiles/service');
 await owner.query('BEGIN');try{await submitProfileCommand(f.actor,f.customerId,{action:'retract_revision',requestKey:randomUUID(),revisionId:f.originalRevisionId,expectedRecordVersion:version,rationale:'Synthetic current recovery denial'},owner as any);await owner.query('COMMIT');}catch(e){await owner.query('ROLLBACK');throw e;}
 // Keep the old projection present to model cleanup not yet having run.
 await owner.query("UPDATE retrieval_sources SET lifecycle_state='current' WHERE id=$1",[projectionId]);const snapshot=await captureRecoveryDenialSnapshot(owner,environmentId,AbortSignal.timeout(60000));
 await owner.query('UPDATE profile_records SET current_accepted_revision_id=$2 WHERE id=$1',[record.record_id,f.originalRevisionId]);
 const scope=await lock(owner,environmentId,snapshot,backup);expect(await reconcileOwnedCredentialDenials(owner,snapshot,scope)).toMatchObject({retiredProjections:1,clearedAcceptedHeads:1,authorityGranted:false,quarantineCleared:false,currentAuthorityVerified:false});expect((await owner.query('SELECT current_accepted_revision_id FROM profile_records WHERE id=$1',[record.record_id])).rows[0].current_accepted_revision_id).toBeNull();expect((await owner.query('SELECT count(*)::int AS n FROM operations_source_denials WHERE source_id=$1',[f.originalRevisionId])).rows[0].n).toBe(1);expect((await owner.query('SELECT lifecycle_state FROM retrieval_sources WHERE id=$1',[projectionId])).rows[0].lifecycle_state).toBe('retired');expect((await owner.query('SELECT mode FROM operations_control')).rows[0].mode).toBe('locked');
}),210000);
it('blocks a missing restored permanent request at the database while allowing a genuinely new key',async()=>fixture(async(owner,runtime,environmentId)=>{
 const f=await pilotPublishedKnowledgeFixture(owner as any,'primary'),connection=await createMcpConnection(f.actor,{requestKey:randomUUID(),name:'Synthetic permanent replay fence',categories:['profiles'],customerIds:[f.customerId],lifetimeDays:1}),backup=await authorityCheckpointTime(owner),requestKey=randomUUID();
 await revokeMcpConnection(f.actor,connection.connection.id,{requestKey,expectedConnectionId:connection.connection.id});const snapshot=await captureRecoveryDenialSnapshot(owner,environmentId,AbortSignal.timeout(60000));
 const old=(await owner.query('SELECT * FROM mcp_management_receipts WHERE request_key=$1',[requestKey])).rows[0];
 await owner.query('BEGIN');try{await owner.query('ALTER TABLE mcp_management_receipts DISABLE TRIGGER mcp_management_immutable');await owner.query('DELETE FROM mcp_management_receipts WHERE request_key=$1',[requestKey]);await owner.query('ALTER TABLE mcp_management_receipts ENABLE TRIGGER mcp_management_immutable');await owner.query('COMMIT');}catch(e){await owner.query('ROLLBACK');throw e;}
 const scope=await lock(owner,environmentId,snapshot,backup),result=await reconcileOwnedCredentialDenials(owner,snapshot,scope);expect(result.permanentReplayFencesAdded).toBeGreaterThan(0);expect(result).toMatchObject({quarantineCleared:false,replayReconciled:false,restorationReady:false});
 const insert='INSERT INTO mcp_management_receipts(request_key,environment_id,workspace_id,actor_membership_id,connection_id,action,request_digest) VALUES($1,$2,$3,$4,$5,$6,$7)',values=[requestKey,environmentId,old.workspace_id,old.actor_membership_id,old.connection_id,old.action,old.request_digest];
 await expect(runtime.query(insert,values)).rejects.toThrow('Recovered permanent request cannot be repeated');const {withTransaction}=await import('../../../lib/server/db/client');await expect(withTransaction(client=>client.query(insert,values))).rejects.toMatchObject({status:409,code:'conflict'});expect((await owner.query('SELECT count(*)::int AS n FROM mcp_management_receipts WHERE request_key=$1',[requestKey])).rows[0].n).toBe(0);
 await runtime.query(insert,[randomUUID(),...values.slice(1)]);expect(await reconcileOwnedCredentialDenials(owner,snapshot,scope)).toMatchObject({permanentReplayFencesAdded:0});
 const inherited=await captureRecoveryDenialSnapshot(owner,environmentId,AbortSignal.timeout(60000));
 await owner.query('BEGIN');try{await owner.query('ALTER TABLE operations_replay_fences DISABLE TRIGGER replay_fence_immutable');await owner.query('DELETE FROM operations_replay_fences');await owner.query('ALTER TABLE operations_replay_fences ENABLE TRIGGER replay_fence_immutable');await owner.query('COMMIT');}catch(e){await owner.query('ROLLBACK');throw e;}
 expect((await reconcileOwnedCredentialDenials(owner,inherited,{...scope,snapshotDigest:inherited.snapshotDigest})).permanentReplayFencesAdded).toBeGreaterThan(0);await expect(runtime.query(insert,values)).rejects.toThrow('Recovered permanent request cannot be repeated');
 await expect(owner.query('DELETE FROM operations_replay_fences')).rejects.toThrow('immutable');await expect(runtime.query('DELETE FROM operations_replay_fences')).rejects.toThrow('permission denied');expect((await owner.query('SELECT mode FROM operations_control')).rows[0].mode).toBe('locked');
}),210000);
it('adds an explicit owner research denial without reconstructing a human decision or changing accepted bytes',async()=>fixture(async(owner,_runtime,environmentId)=>{
 const f=await pilotPublishedKnowledgeFixture(owner as any,'primary'),{ingestVerifiedResearch}=await import('../../../lib/server/profiles/research'),{submitProfileCommand}=await import('../../../lib/server/profiles/service');
 await owner.query('BEGIN');let source:Awaited<ReturnType<typeof ingestVerifiedResearch>>;try{source=await ingestVerifiedResearch({workspaceId:f.actor.workspaceId,customerId:f.customerId,trustedIdentity:'synthetic-fixture-v1',location:'https://example.com/synthetic-recovery-'+randomUUID(),title:'Synthetic recovery evidence',passage:'Synthetic research bytes retained as historical evidence',supportedClaim:'A fictional capability is documented',retrievalAt:new Date(Date.now()-1000).toISOString(),rights:'Synthetic test fixture',audience:'delivery',qualityInput:{rubricVersion:'evidence-quality-v1',R:2,D:4,C:1,reliabilityRationale:'Named synthetic source',directnessRationale:'Exact synthetic passage',corroborationRationale:'Single synthetic source',informationType:'product_capability',dateBasis:'unknown'},checks:{identity:true,scope:true,integrity:true,content:true,rationale:'Owned synthetic fixture checks',checkVersion:'research-check-v1'}},owner as any);await owner.query('COMMIT');}catch(e){await owner.query('ROLLBACK');throw e;}
 const original=(await owner.query('SELECT passage,passage_digest FROM evidence_source_revisions WHERE id=$1',[source.sourceRevisionId])).rows[0],backup=await authorityCheckpointTime(owner);await submitProfileCommand(f.actor,f.customerId,{action:'withdraw_source',requestKey:randomUUID(),sourceRevisionId:source.sourceRevisionId,expectedLifecycleVersion:0,rationale:'Synthetic independently current source denial'});const snapshot=await captureRecoveryDenialSnapshot(owner,environmentId,AbortSignal.timeout(60000));expect(JSON.stringify(snapshot)).not.toContain(original.passage);
 await owner.query('BEGIN');try{await owner.query('ALTER TABLE evidence_source_events DISABLE TRIGGER immutable_source_events');await owner.query('DELETE FROM evidence_source_events WHERE source_revision_id=$1',[source.sourceRevisionId]);await owner.query('ALTER TABLE evidence_source_events ENABLE TRIGGER immutable_source_events');await owner.query('COMMIT');}catch(e){await owner.query('ROLLBACK');throw e;}
 const scope=await lock(owner,environmentId,snapshot,backup);expect(await reconcileOwnedCredentialDenials(owner,snapshot,scope)).toMatchObject({withdrawnResearch:1,authorityGranted:false,currentAuthorityVerified:false});expect((await owner.query('SELECT passage,passage_digest FROM evidence_source_revisions WHERE id=$1',[source.sourceRevisionId])).rows[0]).toEqual(original);expect((await owner.query('SELECT event_type,actor_membership_id,rationale,command_receipt_id FROM evidence_source_events WHERE source_revision_id=$1',[source.sourceRevisionId])).rows[0]).toEqual({event_type:'withdraw',actor_membership_id:null,rationale:'Owner recovery: independently current source proof denies this revision',command_receipt_id:null});expect(await reconcileOwnedCredentialDenials(owner,snapshot,scope)).toMatchObject({withdrawnResearch:0});
}),210000);

it('prevents fresh sign-in through a restored principal disabled by current authority',async()=>fixture(async(owner,_runtime,environmentId)=>{
 const {authenticateDemoPrincipal}=await import('../../../lib/server/auth/credentials');
 const backup=await authorityCheckpointTime(owner);await owner.query('UPDATE principals SET active=false WHERE id=$1',[DEMO_IDS.mcteer]);
 const snapshot=await captureRecoveryDenialSnapshot(owner,environmentId,AbortSignal.timeout(60000));
 await owner.query('UPDATE principals SET active=true WHERE id=$1',[DEMO_IDS.mcteer]);const scope=await lock(owner,environmentId,snapshot,backup);
 expect(await reconcileOwnedCredentialDenials(owner,snapshot,scope)).toMatchObject({revokedPrincipals:1,authorityGranted:false});
 expect(await authenticateDemoPrincipal('mcteer',process.env.TURAS_DEMO_PASSWORD!)).toBeNull();
 expect(await authenticateDemoPrincipal('panel',process.env.PANEL_PASSWORD!)).not.toBeNull();
 expect(await reconcileOwnedCredentialDenials(owner,snapshot,scope)).toMatchObject({revokedPrincipals:0,revokedMemberships:0});
}),210000);
it('prevents fresh administrator sign-in after restoring an older membership revision',async()=>fixture(async(owner,_runtime,environmentId)=>{
 const {authenticateDemoPrincipal}=await import('../../../lib/server/auth/credentials');const backup=await authorityCheckpointTime(owner);
 const old=(await owner.query('SELECT revision FROM memberships WHERE id=$1',[DEMO_IDS.mcteerMembership])).rows[0];
 await owner.query("UPDATE memberships SET role='member',revision=revision+1 WHERE id=$1",[DEMO_IDS.mcteerMembership]);
 const snapshot=await captureRecoveryDenialSnapshot(owner,environmentId,AbortSignal.timeout(60000));
 // A physical restore loads the old tuple without UPDATE triggers. Model that
 // tuple only in this disposable owner fixture; ordinary updates remain fenced.
 await owner.query('BEGIN');try{await owner.query('ALTER TABLE memberships DISABLE TRIGGER partner_membership_epoch');await owner.query("UPDATE memberships SET role='admin',revision=$2 WHERE id=$1",[DEMO_IDS.mcteerMembership,old.revision]);await owner.query('ALTER TABLE memberships ENABLE TRIGGER partner_membership_epoch');await owner.query('COMMIT');}catch(error){await owner.query('ROLLBACK');throw error;}
 const scope=await lock(owner,environmentId,snapshot,backup);
 expect(await reconcileOwnedCredentialDenials(owner,snapshot,scope)).toMatchObject({revokedMemberships:1,authorityGranted:false});
 expect(await authenticateDemoPrincipal('mcteer',process.env.TURAS_DEMO_PASSWORD!)).toBeNull();
 expect((await owner.query('SELECT active,role,revision FROM memberships WHERE id=$1',[DEMO_IDS.mcteerMembership])).rows[0]).toMatchObject({active:false,role:'admin',revision:String(Number(old.revision)+1)});
 expect(await reconcileOwnedCredentialDenials(owner,snapshot,scope)).toMatchObject({revokedMemberships:0});
}),210000);
it('prevents restored partner sign-in when independently current organization authority is disabled',async()=>fixture(async(owner,_runtime,environmentId)=>{
 const {authenticateDemoPrincipal}=await import('../../../lib/server/auth/credentials');const backup=await authorityCheckpointTime(owner);
 await owner.query('UPDATE partner_organizations SET active=false WHERE id=$1',[DEMO_IDS.partnerOrganization]);
 const snapshot=await captureRecoveryDenialSnapshot(owner,environmentId,AbortSignal.timeout(60000));
 await owner.query('UPDATE partner_organizations SET active=true WHERE id=$1',[DEMO_IDS.partnerOrganization]);const scope=await lock(owner,environmentId,snapshot,backup);
 expect(await reconcileOwnedCredentialDenials(owner,snapshot,scope)).toMatchObject({revokedPartnerOrganizations:1,revokedMemberships:1,authorityGranted:false});
 expect(await authenticateDemoPrincipal('partner',process.env.PARTNER_PASSWORD!)).toBeNull();
 expect(await authenticateDemoPrincipal('mcteer',process.env.TURAS_DEMO_PASSWORD!)).not.toBeNull();
 expect(await reconcileOwnedCredentialDenials(owner,snapshot,scope)).toMatchObject({revokedPartnerOrganizations:0,revokedMemberships:0});
}),210000);

it('denies restored partner authority after an organization is disabled and reenabled',async()=>fixture(async(owner,_runtime,environmentId)=>{
 const {authenticateDemoPrincipal}=await import('../../../lib/server/auth/credentials');const backup=await authorityCheckpointTime(owner);
 const old=(await owner.query('SELECT authority_revision FROM partner_organizations WHERE id=$1',[DEMO_IDS.partnerOrganization])).rows[0];
 await owner.query('UPDATE partner_organizations SET active=false WHERE id=$1',[DEMO_IDS.partnerOrganization]);
 await owner.query('UPDATE partner_organizations SET active=true WHERE id=$1',[DEMO_IDS.partnerOrganization]);
 const snapshot=await captureRecoveryDenialSnapshot(owner,environmentId,AbortSignal.timeout(60000));
 await owner.query('BEGIN');try{await owner.query('ALTER TABLE partner_organizations DISABLE TRIGGER partner_organization_epoch');await owner.query('UPDATE partner_organizations SET authority_revision=$2 WHERE id=$1',[DEMO_IDS.partnerOrganization,old.authority_revision]);await owner.query('ALTER TABLE partner_organizations ENABLE TRIGGER partner_organization_epoch');await owner.query('COMMIT');}catch(error){await owner.query('ROLLBACK');throw error;}
 const scope=await lock(owner,environmentId,snapshot,backup);
 expect(await reconcileOwnedCredentialDenials(owner,snapshot,scope)).toMatchObject({revokedPartnerOrganizations:1,revokedMemberships:1,authorityGranted:false});
 expect(await authenticateDemoPrincipal('partner',process.env.PARTNER_PASSWORD!)).toBeNull();
 expect(await authenticateDemoPrincipal('mcteer',process.env.TURAS_DEMO_PASSWORD!)).not.toBeNull();
 expect(await reconcileOwnedCredentialDenials(owner,snapshot,scope)).toMatchObject({revokedPartnerOrganizations:0,revokedMemberships:0});
}),210000);
