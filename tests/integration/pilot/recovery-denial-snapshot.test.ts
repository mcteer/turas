import {it,expect} from 'vitest';
import {Client} from 'pg';
import {randomUUID} from 'node:crypto';
import {withPilotEnvironment,requireOwnedPilotDatabase} from '../../../scripts/pilot-environment';
import {captureRecoveryDenialSnapshot,verifyRecoveryDenialSnapshot} from '../../../lib/server/operations/recovery-denial-snapshot';
import {pilotPublishedKnowledgeFixture} from '../../fixtures/pilot/knowledge';
import {createMcpConnection,revokeMcpConnection} from '../../../lib/server/mcp/management';
import {createOwnedConversation} from '../../../lib/server/conversations/repository';
import {recoveryDigest} from '../../../lib/contracts/pilot-recovery';
async function fixture(run:(owner:Client,runtime:Client,environmentId:string)=>Promise<void>){await withPilotEnvironment(async env=>{const owner=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)}),runtime=new Client({connectionString:requireOwnedPilotDatabase()});await owner.connect();await runtime.connect();try{await run(owner,runtime,env.environmentId);}finally{await runtime.end();await owner.end();}},{postgresMajor:18,deadlineMs:180000});}
it('captures minimized actual denial and replay metadata without source text or credential bytes',async()=>fixture(async(owner,_runtime,environmentId)=>{
 const f=await pilotPublishedKnowledgeFixture(owner as any,'primary'),connection=await createMcpConnection(f.actor,{requestKey:randomUUID(),name:'Synthetic secret-free authority snapshot',categories:['profiles'],customerIds:[f.customerId],lifetimeDays:1});
 if(!connection.secretAvailable)throw Error('Fresh synthetic connection required');
 const session=(await owner.query('SELECT token_hash FROM login_sessions WHERE id=$1',[f.actor.sessionId])).rows[0].token_hash;
 const credential=(await owner.query('SELECT credential_hash FROM mcp_connections WHERE id=$1',[connection.connection.id])).rows[0].credential_hash;
 const conversation=await createOwnedConversation(f.actor,{customerId:f.customerId,requestKey:randomUUID(),title:'Synthetic private title omitted from recovery metadata'}),nativeId='wrun_synthetic_'+randomUUID().replaceAll('-','');
 await owner.query("UPDATE conversations SET binding_state='bound',eve_session_id=$2 WHERE id=$1",[conversation.conversation.id,nativeId]);
 const snapshot=await captureRecoveryDenialSnapshot(owner,environmentId,AbortSignal.timeout(60000)),serialized=JSON.stringify(snapshot);
 expect(snapshot).toMatchObject({schemaVersion:79,currentAuthorityVerified:false,replayReconciled:false,restorationReady:false});
 for(const secret of [session,credential,f.actor.token,connection.credential,'Synthetic observed build stage timing','Synthetic private title omitted from recovery metadata'])expect(serialized).not.toContain(secret);
 expect(snapshot.tables.find(t=>t.name==='mcp_connections')?.rows.find(r=>r.identity.id===connection.connection.id)?.status.credential_hash).toBe(true);
 expect(snapshot.tables.find(t=>t.name==='mcp_management_receipts')?.rows.length).toBeGreaterThan(0);
 for(const name of ['ordinary_model_operations','ordinary_conversation_allowances','parity_evaluation_operations','parity_evaluation_budgets','ordinary_question_posts','ordinary_question_continuations','ordinary_native_uploads','retrieval_embedding_operations'])expect(snapshot.tables.some(t=>t.name===name)).toBe(true);
 expect(snapshot.tables.find(t=>t.name==='ordinary_question_posts')?.replayKeyColumns?.some(columns=>columns.includes('request_event_id'))).toBe(true);
 expect(snapshot.tables.some(t=>t.name==='conversations')).toBe(true);expect(snapshot.tables.some(t=>t.name==='watchdog_jobs')).toBe(true);
 expect(snapshot.tables.find(t=>t.name==='conversations')?.rows.find(row=>row.identity.id===conversation.conversation.id)?.status).toMatchObject({binding_state:'bound',eve_session_id:nativeId,owner_principal_id:f.actor.principalId});
 expect(snapshot.tables.find(t=>t.name==='profile_records')?.rows.some(row=>row.status.current_accepted_revision_id===f.originalRevisionId)).toBe(true);
 expect(snapshot.tables.find(t=>t.name==='knowledge_publications')?.rows.find(row=>row.identity.id===f.publicationId)?.status).toMatchObject({state:'published',head_generation:f.generation});
 for(const name of ['operations_cost_reservations','operations_cost_reconciliations','operations_hosted_jobs','learning_attempts','learning_model_dispatches','support_advice_attempts','expansion_advice_attempts','research_operations'])expect(snapshot.tables.some(t=>t.name===name)).toBe(true);
 expect(verifyRecoveryDenialSnapshot(snapshot,{environmentId,contextDigest:snapshot.snapshotDigest,after:snapshot.capturedAt,now:Date.now()})).toMatchObject({independentSnapshotFresh:true,currentAuthorityVerified:false,replayReconciled:false});
 // Older authenticated receipts remain valid narrower evidence; none grants
 // native resumption or full recovery authority.
 const {snapshotDigest:_,currentAuthorityVerified:_a,replayReconciled:_r,restorationReady:_s,...content}=snapshot;
 const legacyContent={...content,contract:'pilot-denial-replay-snapshot-v4',tables:content.tables.filter(t=>!['conversations','watchdog_jobs'].includes(t.name))},legacyDigest=recoveryDigest(legacyContent);
 expect(verifyRecoveryDenialSnapshot({...legacyContent,snapshotDigest:legacyDigest,currentAuthorityVerified:false,replayReconciled:false,restorationReady:false},{environmentId,contextDigest:legacyDigest,after:snapshot.capturedAt,now:Date.now()}).currentAuthorityVerified).toBe(false);
 const incomplete={...content,tables:content.tables.filter(t=>t.name!=='conversations')},incompleteDigest=recoveryDigest(incomplete);
 expect(()=>verifyRecoveryDenialSnapshot({...incomplete,snapshotDigest:incompleteDigest,currentAuthorityVerified:false,replayReconciled:false,restorationReady:false},{environmentId,contextDigest:incompleteDigest,after:snapshot.capturedAt,now:Date.now()})).toThrow('Complete exact current denial inventory');
}),210000);
it('captures later MCP denial and permanent management receipt at a distinct current watermark',async()=>fixture(async(owner,_runtime,environmentId)=>{
 const f=await pilotPublishedKnowledgeFixture(owner as any,'primary'),connection=await createMcpConnection(f.actor,{requestKey:randomUUID(),name:'Synthetic later denial',categories:['profiles'],customerIds:[f.customerId],lifetimeDays:1});
 const before=await captureRecoveryDenialSnapshot(owner,environmentId,AbortSignal.timeout(60000));
 const requestKey=randomUUID();await revokeMcpConnection(f.actor,connection.connection.id,{requestKey,expectedConnectionId:connection.connection.id});
 const after=await captureRecoveryDenialSnapshot(owner,environmentId,AbortSignal.timeout(60000));
 expect(after.snapshotDigest).not.toBe(before.snapshotDigest);expect(Date.parse(after.capturedAt)).toBeGreaterThanOrEqual(Date.parse(before.capturedAt));
 const row=after.tables.find(t=>t.name==='mcp_connections')?.rows.find(r=>r.identity.id===connection.connection.id);expect(row?.status).toMatchObject({credential_hash:true,revoked_at:expect.any(String)});
 // Revocation denies immediately; the governed cleanup removes credential hashes
 // later. Retain only that presence bit, never the actual credential bytes.
 const {authenticateMcpBearer}=await import('../../../lib/server/mcp/credentials');if(!connection.secretAvailable)throw Error('Fresh synthetic credential required');await expect(authenticateMcpBearer('Bearer '+connection.credential)).rejects.toThrow();
 expect(after.tables.find(t=>t.name==='mcp_management_receipts')?.rows.length).toBeGreaterThan(before.tables.find(t=>t.name==='mcp_management_receipts')!.rows.length);
 const receipt=after.tables.find(t=>t.name==='mcp_management_receipts')?.rows.find(row=>row.identity.request_key===requestKey);expect(after.contract).toBe('pilot-denial-replay-snapshot-v7');expect(receipt?.status).toMatchObject({request_key:requestKey,request_digest:expect.stringMatching(/^[a-f0-9]{64}$/),actor_membership_id:f.actor.membershipId,action:'revoke'});
 expect(verifyRecoveryDenialSnapshot(after,{environmentId,contextDigest:after.snapshotDigest,after:before.capturedAt,now:Date.now()}).currentAuthorityVerified).toBe(false);
}),210000);
it('rejects runtime foreign cancelled stale and changed denial snapshots without granting recovery authority',async()=>fixture(async(owner,runtime,environmentId)=>{
 await expect(captureRecoveryDenialSnapshot(runtime,environmentId,AbortSignal.timeout(60000))).rejects.toThrow('owner identity');
 await expect(captureRecoveryDenialSnapshot(owner,'foreign',AbortSignal.timeout(60000))).rejects.toThrow('owner identity');
 const controller=new AbortController();controller.abort();await expect(captureRecoveryDenialSnapshot(owner,environmentId,controller.signal)).rejects.toThrow();
 const snapshot=await captureRecoveryDenialSnapshot(owner,environmentId,AbortSignal.timeout(60000)),input={environmentId,contextDigest:snapshot.snapshotDigest,after:snapshot.capturedAt,now:Date.now()};
 expect(()=>verifyRecoveryDenialSnapshot(snapshot,{...input,now:Date.parse(snapshot.capturedAt)+300001})).toThrow('Fresh independent');
 expect(()=>verifyRecoveryDenialSnapshot(snapshot,{...input,after:new Date(Date.parse(snapshot.capturedAt)+1).toISOString()})).toThrow('Fresh independent');
 expect(()=>verifyRecoveryDenialSnapshot({...snapshot,tables:snapshot.tables.slice(1)},input)).toThrow('Fresh independent');
 expect(()=>verifyRecoveryDenialSnapshot({...snapshot,currentAuthorityVerified:true},input)).toThrow();
}),210000);
it('refuses oversized current authority tables rather than retaining a truncated proof',async()=>fixture(async(owner,_runtime,environmentId)=>{
 await owner.query("INSERT INTO principals(id,login_name,display_name) SELECT gen_random_uuid(),'synthetic-denial-'||n,'Synthetic metadata bound' FROM generate_series(1,10001) n");
 await expect(captureRecoveryDenialSnapshot(owner,environmentId,AbortSignal.timeout(60000))).rejects.toThrow('table exceeds bound');
 expect((await owner.query('SELECT count(*)::int AS n FROM principals')).rows[0].n).toBeGreaterThan(10000);
 expect((await owner.query('SELECT mode FROM operations_control')).rows[0].mode).toBe('open');
}),210000);
