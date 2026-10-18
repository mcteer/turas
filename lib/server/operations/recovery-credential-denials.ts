import {currentRecoveryStateDigest} from './recovery-state';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {requireOwnedPilotDatabase} from '../../../scripts/pilot-environment';
import type {Client,PoolClient} from 'pg';
import {z} from 'zod';
import {recoveryDenialSnapshotSchema,verifyRecoveryDenialSnapshot} from './recovery-denial-snapshot';
const command=z.strictObject({environmentId:z.string().min(1).max(256),recoveryId:z.uuid(),controlRevision:z.number().int().positive(),snapshotDigest:z.string().regex(/^[a-f0-9]{64}$/),backupCapturedAt:z.iso.datetime({offset:true})});
const uuid=z.uuid();
/** Reapply credential/grant and current-projection denials into an actually marked disposable
 * owner target. Never grant/revive authority, dispatch work, clear quarantine,
 * or represent full source/publication/provider/replay verification as complete. */
export async function reconcileOwnedCredentialDenials(db:Client|PoolClient,raw:unknown,input:z.infer<typeof command>){
 await db.query('BEGIN');
 try{const result=await reconcileOwnedCredentialDenialsInTransaction(db,raw,input);await db.query('COMMIT');return result;}
 catch(error){await db.query('ROLLBACK');throw error;}
}
/** Internal composed recovery step. Requires the caller's owner transaction;
 * never commits partial state or turns supplied labels into proof. */
export async function reconcileOwnedCredentialDenialsInTransaction(db:Client|PoolClient,raw:unknown,input:z.infer<typeof command>){
 const scope=command.parse(input),snapshot=recoveryDenialSnapshotSchema.parse(raw);
 await db.query('SAVEPOINT current_denial_reconciliation');await db.query('RELEASE SAVEPOINT current_denial_reconciliation');
  await db.query("SET LOCAL lock_timeout='3000ms'");await db.query("SET LOCAL statement_timeout='10000ms'");await db.query("SET LOCAL transaction_timeout='60s'");
  const identity=(await db.query(`SELECT current_database() AS name,current_user AS role,
   current_user=pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid='operations_control'::regclass)) AS owner FROM pg_database d WHERE d.datname=current_database()`)).rows[0];
  const target=new URL(requireOwnedPilotDatabase(process.env,true));
  if(identity?.owner!==true||identity.name!==target.pathname.slice(1)||identity.role!==decodeURIComponent(target.username))throw Error('Actual owned isolated credential target required');
  const token=identity.name.slice('turas_test_016_eval_'.length);
  const owned=await promisify(execFile)('docker',['inspect','--format','{{index .Config.Labels \"turas.016.owner\"}}','turas-016-check-'+token],{timeout:5000,maxBuffer:8192});
  if(owned.stdout.trim()!==token)throw Error('Actual owned isolated credential target required');
  const marker=(await db.query('SELECT environment_id,schema_version FROM turas_environment')).rows;
  if(marker.length!==1||marker[0].environment_id!==scope.environmentId||Number(marker[0].schema_version)!==79)throw Error('Exact credential recovery target differs');
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,16020))',[scope.environmentId]);await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,16017))',[scope.environmentId]);
  const control=(await db.query('SELECT mode,revision,recovery_id FROM operations_control WHERE environment_id=$1 FOR UPDATE',[scope.environmentId])).rows[0];
  if(control?.mode!=='locked'||Number(control.revision)!==scope.controlRevision||control.recovery_id!==scope.recoveryId)throw Error('Exact locked credential reconciliation required');
  const now=Number((await db.query('SELECT extract(epoch FROM clock_timestamp())*1000 AS now')).rows[0].now);
  verifyRecoveryDenialSnapshot(snapshot,{environmentId:scope.environmentId,contextDigest:scope.snapshotDigest,after:scope.backupCapturedAt,now});
  const index=(name:string)=>new Map(snapshot.tables.find(table=>table.name===name)!.rows.map(row=>[uuid.parse(row.identity.id),row.status]));
  const principals=index('principals'),memberships=index('memberships'),sessions=index('login_sessions'),connections=index('mcp_connections'),grants=index('customer_grants');
  const workspaces=['pilot-denial-replay-snapshot-v6','pilot-denial-replay-snapshot-v7'].includes(snapshot.contract)?index('workspaces'):new Map<string,Record<string,unknown>>(),organizations=['pilot-denial-replay-snapshot-v6','pilot-denial-replay-snapshot-v7'].includes(snapshot.contract)?index('partner_organizations'):new Map<string,Record<string,unknown>>();
  const targetWorkspaces=new Map((await db.query('SELECT id,active,classification,pilot_environment_id,pilot_provisioning_id FROM workspaces FOR SHARE')).rows.map(row=>[row.id,row]));
  const workspaceCurrent=(id:string)=>{const current=workspaces.get(id),target=targetWorkspaces.get(id);return current?.active===true&&target?.active===true&&(snapshot.schemaVersion===55&&current.classification===undefined?target.classification==='primary'&&target.pilot_environment_id===null&&target.pilot_provisioning_id===null:current.classification===target.classification&&current.pilot_environment_id===target.pilot_environment_id&&current.pilot_provisioning_id===target.pilot_provisioning_id);};
  const targetPrincipals=new Map((await db.query('SELECT id,active FROM principals FOR SHARE')).rows.map(row=>[row.id,row]));
  const targetOrganizations=new Map((await db.query('SELECT id,active,workspace_id,authority_revision FROM partner_organizations FOR SHARE')).rows.map(row=>[row.id,row]));
  const targetMemberships=new Map((await db.query('SELECT id,active,principal_id,workspace_id,kind,role,partner_org_id,revision FROM memberships FOR SHARE')).rows.map(row=>[row.id,row]));
  const membershipCurrent=(current:Record<string,unknown>|undefined,target:any)=>!!current&&current.active===true&&target?.active===true&&principals.get(target.principal_id)?.active===true&&targetPrincipals.get(target.principal_id)?.active===true&&workspaceCurrent(target.workspace_id)&&current.principal_id===target.principal_id&&current.workspace_id===target.workspace_id&&current.kind===target.kind&&current.role===target.role&&Number(current.revision)===Number(target.revision)&&(target.kind==='internal'||current.partner_org_id===target.partner_org_id&&organizations.get(target.partner_org_id)?.active===true&&targetOrganizations.get(target.partner_org_id)?.active===true&&Number.isSafeInteger(Number(organizations.get(target.partner_org_id)?.authority_revision))&&Number(organizations.get(target.partner_org_id)?.authority_revision)===Number(targetOrganizations.get(target.partner_org_id)?.authority_revision)&&targetOrganizations.get(target.partner_org_id)?.workspace_id===target.workspace_id&&organizations.get(target.partner_org_id)?.workspace_id===target.workspace_id);
  // Revoking an old session alone cannot prevent a restored active account
  // from signing in again. Deny stale identity/role authority itself; never
  // promote or recreate a current identity from minimized snapshot metadata.
  let revokedPrincipals=0,revokedMemberships=0,revokedWorkspaces=0,revokedPartnerOrganizations=0;
  for(const row of (await db.query('SELECT id FROM workspaces WHERE active FOR UPDATE')).rows){if(!workspaceCurrent(row.id))revokedWorkspaces+=(await db.query('UPDATE workspaces SET active=false WHERE id=$1 AND active',[row.id])).rowCount??0;}
  for(const row of (await db.query('SELECT id,workspace_id,authority_revision FROM partner_organizations WHERE active FOR UPDATE')).rows){const current=organizations.get(row.id);if(current?.active!==true||current.workspace_id!==row.workspace_id||!Number.isSafeInteger(Number(current.authority_revision))||Number(current.authority_revision)!==Number(row.authority_revision)||!workspaceCurrent(row.workspace_id))revokedPartnerOrganizations+=(await db.query('UPDATE partner_organizations SET active=false WHERE id=$1 AND active',[row.id])).rowCount??0;}
  for(const row of (await db.query('SELECT id FROM principals WHERE active FOR UPDATE')).rows){
   if(principals.get(row.id)?.active!==true)revokedPrincipals+=(await db.query('UPDATE principals SET active=false WHERE id=$1 AND active',[row.id])).rowCount??0;
  }
  for(const row of (await db.query('SELECT id,active,principal_id,workspace_id,kind,role,partner_org_id,revision FROM memberships WHERE active FOR UPDATE')).rows){
   const current=memberships.get(row.id);
   if(!membershipCurrent(current,row))revokedMemberships+=(await db.query('UPDATE memberships SET active=false,revision=revision+1 WHERE id=$1 AND active',[row.id])).rowCount??0;
  }
  const active=(principalId:string,membershipId:string)=>{const captured=memberships.get(membershipId),target=targetMemberships.get(membershipId);return target?.principal_id===principalId&&membershipCurrent(captured,target);};
  const future=(value:unknown)=>typeof value==='string'&&Number.isFinite(Date.parse(value))&&Date.parse(value)>now;
  let revokedSessions=0,revokedMcpConnections=0,revokedGrants=0;
  const rows=(await db.query('SELECT id,principal_id,membership_id,workspace_id,expires_at FROM login_sessions WHERE revoked_at IS NULL FOR UPDATE')).rows;
  for(const row of rows){const current=sessions.get(row.id),membership=memberships.get(row.membership_id);
   if(!current||current.principal_id!==row.principal_id||current.revoked_at!==null||!future(current.expires_at)||Date.parse(String(current.expires_at))!==row.expires_at.getTime()||!active(row.principal_id,row.membership_id)||membership?.workspace_id!==row.workspace_id){
    revokedSessions+=(await db.query('UPDATE login_sessions SET revoked_at=clock_timestamp() WHERE id=$1 AND revoked_at IS NULL',[row.id])).rowCount??0;
   }
  }
  const mcp=(await db.query('SELECT id,principal_id,membership_id,workspace_id,expires_at FROM mcp_connections WHERE environment_id=$1 AND credential_hash IS NOT NULL FOR UPDATE',[scope.environmentId])).rows;
  for(const row of mcp){const current=connections.get(row.id),membership=memberships.get(row.membership_id);
   if(!current||current.principal_id!==row.principal_id||current.membership_id!==row.membership_id||current.workspace_id!==row.workspace_id||current.revoked_at!==null||current.credential_hash!==true||!future(current.expires_at)||Date.parse(String(current.expires_at))!==row.expires_at.getTime()||!active(row.principal_id,row.membership_id)||membership?.workspace_id!==row.workspace_id){
    revokedMcpConnections+=(await db.query('UPDATE mcp_connections SET credential_hash=NULL WHERE id=$1 AND credential_hash IS NOT NULL',[row.id])).rowCount??0;
   }
  }
  const affected=new Set<string>(),targetGrants=(await db.query("SELECT id,membership_id,workspace_id,customer_id,revision FROM customer_grants WHERE state='active' FOR UPDATE")).rows;
  for(const row of targetGrants){const current=grants.get(row.id),membership=memberships.get(row.membership_id);
   if(!current||current.state!=='active'||current.membership_id!==row.membership_id||current.workspace_id!==row.workspace_id||current.customer_id!==row.customer_id||!Number.isSafeInteger(Number(current.revision))||Number(current.revision)!==Number(row.revision)||!membership||!membershipCurrent(membership,targetMemberships.get(row.membership_id))||membership.workspace_id!==row.workspace_id){
    const result=await db.query("UPDATE customer_grants SET state='revoked',revision=revision+1,changed_at=clock_timestamp() WHERE id=$1 AND state='active'",[row.id]);revokedGrants+=result.rowCount??0;if(result.rowCount)affected.add(row.customer_id);
   }
  }
  if(affected.size)await db.query('UPDATE customer_profile_state SET delivery_generation=delivery_generation+1,updated_at=clock_timestamp() WHERE customer_id=ANY($1::uuid[])',[[...affected]]);
  let retiredProjections=0,suspendedPublications=0,clearedAcceptedHeads=0,withdrawnArtifacts=0,withdrawnResearch=0;
  const auditDenial=async(kind:string,id:string,generation:number)=>{await db.query(`INSERT INTO operations_source_denials(environment_id,recovery_id,control_revision,source_kind,source_id,observed_target_generation,snapshot_digest,source_captured_at)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING`,[scope.environmentId,scope.recoveryId,scope.controlRevision,kind,id,generation,scope.snapshotDigest,snapshot.capturedAt]);};
  if(['pilot-denial-replay-snapshot-v4','pilot-denial-replay-snapshot-v5','pilot-denial-replay-snapshot-v6','pilot-denial-replay-snapshot-v7'].includes(snapshot.contract)){
   const records=index('profile_records'),artifacts=index('artifact_versions'),research=index('evidence_source_revisions');
   const targetHeads=(await db.query('SELECT id,workspace_id,customer_id,current_accepted_revision_id,version FROM profile_records WHERE current_accepted_revision_id IS NOT NULL FOR UPDATE')).rows;
   const changedCustomers=new Set<string>();
   for(const record of targetHeads){const current=records.get(record.id);
    if(!current||current.workspace_id!==record.workspace_id||current.customer_id!==record.customer_id||current.current_accepted_revision_id!==record.current_accepted_revision_id){
     await auditDenial('accepted_profile',record.current_accepted_revision_id,Number(record.version));
     clearedAcceptedHeads+=(await db.query('UPDATE profile_records SET current_accepted_revision_id=NULL,version=version+1 WHERE id=$1 AND current_accepted_revision_id IS NOT NULL',[record.id])).rowCount??0;changedCustomers.add(record.customer_id);
    }
   }
   if(changedCustomers.size)await db.query('UPDATE customer_profile_state SET internal_generation=internal_generation+1,delivery_generation=delivery_generation+1,updated_at=clock_timestamp() WHERE customer_id=ANY($1::uuid[])',[[...changedCustomers]]);
   const versions=(await db.query("SELECT id,workspace_id,customer_id,state,lifecycle_generation,sha256_digest FROM artifact_versions WHERE state IN('ready','partial') FOR UPDATE")).rows;
   for(const version of versions){const current=artifacts.get(version.id);
    if(!current||!['ready','partial'].includes(String(current.state))||current.workspace_id!==version.workspace_id||current.customer_id!==version.customer_id||Number(current.lifecycle_generation)!==Number(version.lifecycle_generation)||current.sha256_digest!==version.sha256_digest){
     await auditDenial('artifact_version',version.id,Number(version.lifecycle_generation));
     withdrawnArtifacts+=(await db.query("UPDATE artifact_versions SET state='withdrawn',lifecycle_generation=lifecycle_generation+1 WHERE id=$1 AND state IN('ready','partial')",[version.id])).rowCount??0;
    }
   }
   const deniedResearch=new Set(snapshot.tables.find(table=>table.name==='evidence_source_events')!.rows.filter(row=>['withdraw','supersede'].includes(String(row.status.event_type))).map(row=>String(row.status.source_revision_id)));
   const revisions=(await db.query(`SELECT v.id,v.workspace_id,v.customer_id,v.version,v.passage_digest FROM evidence_source_revisions v
    WHERE NOT EXISTS(SELECT 1 FROM evidence_source_events e WHERE e.source_revision_id=v.id AND e.event_type IN('withdraw','supersede')) FOR UPDATE OF v`)).rows;
   for(const revision of revisions){const current=research.get(revision.id);
    if(!current||current.workspace_id!==revision.workspace_id||current.customer_id!==revision.customer_id||Number(current.version)!==Number(revision.version)||current.passage_digest!==revision.passage_digest||current.passage!==true||deniedResearch.has(revision.id)||(current.payload_expires_at!=null&&!future(current.payload_expires_at))){
     await auditDenial('verified_research',revision.id,Number(revision.version));
     // This is a new owner recovery denial, never a reconstructed human decision.
     // Accepted bytes and all original lifecycle events remain untouched.
     withdrawnResearch+=(await db.query(`INSERT INTO evidence_source_events(id,source_revision_id,lifecycle_version,event_type,actor_membership_id,rationale,command_receipt_id)
      SELECT gen_random_uuid(),$1,COALESCE(max(lifecycle_version),0)+1,'withdraw',NULL,'Owner recovery: independently current source proof denies this revision',NULL FROM evidence_source_events WHERE source_revision_id=$1`,[revision.id])).rowCount??0;
    }
   }
  }
  if(snapshot.contract!=='pilot-denial-replay-snapshot-v2'){
   const publications=index('knowledge_publications'),sources=index('retrieval_sources');
   const acceptedHeads=new Set([...index('profile_records').values()].map(record=>record.current_accepted_revision_id).filter(head=>typeof head==='string'));
   const published=(await db.query("SELECT id,revision_id,head_generation FROM knowledge_publications WHERE environment_id=$1 AND state='published' FOR UPDATE",[scope.environmentId])).rows;
   for(const publication of published){const current=publications.get(publication.id);
    if(!current||current.state!=='published'||current.revision_id!==publication.revision_id||Number(current.head_generation)!==Number(publication.head_generation)){
     if(['pilot-denial-replay-snapshot-v4','pilot-denial-replay-snapshot-v5','pilot-denial-replay-snapshot-v6','pilot-denial-replay-snapshot-v7'].includes(snapshot.contract))await auditDenial('shared_publication',publication.revision_id,Number(publication.head_generation));
     suspendedPublications+=(await db.query("UPDATE knowledge_publications SET state='suspended',head_generation=head_generation+1,updated_at=clock_timestamp() WHERE id=$1 AND state='published'",[publication.id])).rowCount??0;
    }
   }
   const projections=(await db.query("SELECT id,source_kind,source_revision_id,source_generation,content_digest,contract_digest FROM retrieval_sources WHERE environment_id=$1 AND lifecycle_state='current' FOR UPDATE",[scope.environmentId])).rows;
   for(const projection of projections){const current=sources.get(projection.id);
    const same=current?.lifecycle_state==='current'&&current.source_kind===projection.source_kind&&current.source_revision_id===projection.source_revision_id&&Number(current.source_generation)===Number(projection.source_generation)&&current.content_digest===projection.content_digest&&current.contract_digest===projection.contract_digest;
    const publicationCurrent=projection.source_kind!=='published_shared'||published.some(publication=>publication.revision_id===projection.source_revision_id&&publications.get(publication.id)?.state==='published'&&publications.get(publication.id)?.revision_id===publication.revision_id&&Number(publications.get(publication.id)?.head_generation)===Number(publication.head_generation));
    const profileCurrent=projection.source_kind!=='accepted_profile'||acceptedHeads.has(projection.source_revision_id);
    if(!same||!publicationCurrent||!profileCurrent)retiredProjections+=(await db.query("UPDATE retrieval_sources SET lifecycle_state='retired',updated_at=clock_timestamp() WHERE id=$1 AND lifecycle_state='current'",[projection.id])).rowCount??0;
   }
  }
  let typedModelHoldsAdded=0;
  if(snapshot.contract==='pilot-denial-replay-snapshot-v7'){
   const holds:Array<{kind:'ordinary_tokens'|'parity_dollars';id:string;scopeId:string;ceiling:number;actual:number|null;settledAt:string|null;evidenceKind:'operation'|'inherited_hold';observedDigest:string;observedAt:string;observedDigestKind:'operation_row'|'snapshot';baseline:number|null}>=[];
   const baselines=new Map((snapshot.tables.find(table=>table.name==='ordinary_conversation_allowances')?.rows??[]).map(row=>[uuid.parse(row.identity.conversation_id),z.coerce.number().int().nonnegative().parse(row.status.baseline_output_tokens)]));
   for(const entry of snapshot.tables){
    if(!['ordinary_model_operations','parity_evaluation_operations','operations_recovery_model_holds'].includes(entry.name))continue;
    for(const row of entry.rows){
     const actualValue=entry.name==='ordinary_model_operations'||row.identity.operation_kind==='ordinary_tokens'?row.status.actual_tokens:row.status.actual_micro_usd;
     const actual=actualValue==null?null:z.coerce.number().int().nonnegative().safe().parse(actualValue),settledAt=row.status.settled_at==null?null:z.iso.datetime({offset:true}).parse(row.status.settled_at);
     if(entry.name==='operations_recovery_model_holds'){
      const kind=z.enum(['ordinary_tokens','parity_dollars']).parse(row.identity.operation_kind);
      holds.push({kind,id:uuid.parse(row.identity.operation_id),scopeId:uuid.parse(row.status.scope_id),baseline:kind==='ordinary_tokens'?z.coerce.number().int().nonnegative().parse(row.status.baseline_output_tokens):null,actual,settledAt,evidenceKind:'inherited_hold',observedDigestKind:z.enum(['operation_row','snapshot']).parse(row.status.evidence_digest_kind),observedDigest:z.string().regex(/^[a-f0-9]{64}$/).parse(row.status.evidence_digest),observedAt:z.iso.datetime({offset:true}).parse(row.status.source_captured_at),ceiling:z.coerce.number().int().nonnegative().safe().parse(kind==='ordinary_tokens'?row.status.ceiling_tokens:row.status.ceiling_micro_usd)});
     }else{
      const ordinary=entry.name==='ordinary_model_operations';
      holds.push({kind:ordinary?'ordinary_tokens':'parity_dollars',id:uuid.parse(row.identity.id),scopeId:uuid.parse(ordinary?row.status.conversation_id:row.status.budget_id),baseline:ordinary?z.number().int().nonnegative().parse(baselines.get(uuid.parse(row.status.conversation_id))):null,actual,settledAt,evidenceKind:'operation',observedDigestKind:'snapshot',observedDigest:snapshot.snapshotDigest,observedAt:snapshot.capturedAt,ceiling:z.coerce.number().int().nonnegative().safe().parse(ordinary?row.status.ceiling_tokens:row.status.ceiling_micro_usd)});
     }
    }
   }
   for(const hold of holds)typedModelHoldsAdded+=(await db.query(`INSERT INTO operations_recovery_model_holds(environment_id,operation_kind,operation_id,scope_id,ceiling_tokens,ceiling_micro_usd,evidence_digest,source_captured_at,recovery_id,control_revision,actual_tokens,actual_micro_usd,settled_at,evidence_digest_kind,baseline_output_tokens)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'snapshot',$14) ON CONFLICT(environment_id,operation_kind,operation_id) DO NOTHING`,[scope.environmentId,hold.kind,hold.id,hold.scopeId,hold.kind==='ordinary_tokens'?hold.ceiling:null,hold.kind==='parity_dollars'?hold.ceiling:null,scope.snapshotDigest,snapshot.capturedAt,scope.recoveryId,scope.controlRevision,hold.kind==='ordinary_tokens'?hold.actual:null,hold.kind==='parity_dollars'?hold.actual:null,hold.settledAt,hold.baseline])).rowCount??0;
   for(const hold of holds){
    const retained=(await db.query('SELECT scope_id,ceiling_tokens,ceiling_micro_usd,baseline_output_tokens FROM operations_recovery_model_holds WHERE environment_id=$1 AND operation_kind=$2 AND operation_id=$3',[scope.environmentId,hold.kind,hold.id])).rows[0];
    if(!retained||retained.scope_id!==hold.scopeId||retained.baseline_output_tokens!==hold.baseline||Number(hold.kind==='ordinary_tokens'?retained.ceiling_tokens:retained.ceiling_micro_usd)!==hold.ceiling)throw Error('Recovered model hold identity differs');
   }
   for(const hold of holds){
    const ordinary=hold.kind==='ordinary_tokens',table=ordinary?'ordinary_model_operations':'parity_evaluation_operations';
    const local=(await db.query(ordinary?`SELECT conversation_id AS scope,ceiling_tokens AS ceiling,actual_tokens AS actual FROM ${table} WHERE id=$1`:`SELECT budget_id AS scope,ceiling_micro_usd AS ceiling,actual_micro_usd AS actual FROM ${table} WHERE id=$1`,[hold.id])).rows[0];
    if(local&&(local.scope!==hold.scopeId||Number(local.ceiling)!==hold.ceiling||local.actual!==null&&hold.actual!==null&&Number(local.actual)!==hold.actual))throw Error('Recovered immutable model operation differs');
    if(ordinary){
     const prior=baselines.get(hold.scopeId);if(prior!==undefined&&prior!==hold.baseline)throw Error('Recovered immutable conversation baseline differs');
     baselines.set(hold.scopeId,hold.baseline!);
    }
   }
   for(const [conversationId,baseline] of baselines){
    if(!holds.some(hold=>hold.kind==='ordinary_tokens'&&hold.scopeId===conversationId))continue;
    await db.query(`INSERT INTO ordinary_conversation_allowances(conversation_id,baseline_output_tokens)
     SELECT id,$2 FROM conversations WHERE id=$1 AND environment_id=$3 AND NOT EXISTS(SELECT 1 FROM ordinary_conversation_allowances WHERE conversation_id=$1)`,[conversationId,baseline,scope.environmentId]);
    const local=(await db.query('SELECT baseline_output_tokens FROM ordinary_conversation_allowances WHERE conversation_id=$1',[conversationId])).rows[0];
    if(local&&Number(local.baseline_output_tokens)!==baseline)throw Error('Recovered immutable conversation baseline differs');
   }
   const observations=holds.map(hold=>({kind:hold.kind,id:hold.id,ceiling:hold.ceiling,actual:hold.actual,settledAt:hold.settledAt,evidenceKind:hold.evidenceKind,observedDigest:hold.observedDigest,observedAt:hold.observedAt,observedDigestKind:hold.observedDigestKind}));
   for(const row of snapshot.tables.find(entry=>entry.name==='operations_recovery_model_observations')?.rows??[]){
    const kind=z.enum(['ordinary_tokens','parity_dollars']).parse(row.identity.operation_kind),ordinary=kind==='ordinary_tokens';
    observations.push({kind,id:uuid.parse(row.identity.operation_id),ceiling:z.coerce.number().int().nonnegative().safe().parse(ordinary?row.status.ceiling_tokens:row.status.ceiling_micro_usd),
     actual:(ordinary?row.status.actual_tokens:row.status.actual_micro_usd)==null?null:z.coerce.number().int().nonnegative().safe().parse(ordinary?row.status.actual_tokens:row.status.actual_micro_usd),
     settledAt:row.status.settled_at==null?null:z.iso.datetime({offset:true}).parse(row.status.settled_at),evidenceKind:z.enum(['operation','inherited_hold']).parse(row.identity.evidence_kind),
     observedDigestKind:z.enum(['operation_row','snapshot']).parse(row.status.observed_digest_kind),observedDigest:z.string().regex(/^[a-f0-9]{64}$/).parse(row.identity.observed_evidence_digest),observedAt:z.iso.datetime({offset:true}).parse(row.status.observed_captured_at)});
   }
   for(const observation of observations)await db.query(`INSERT INTO operations_recovery_model_observations(environment_id,operation_kind,operation_id,observed_evidence_digest,observed_captured_at,evidence_kind,ceiling_tokens,ceiling_micro_usd,actual_tokens,actual_micro_usd,settled_at,snapshot_digest,source_captured_at,recovery_id,control_revision,observed_digest_kind)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) ON CONFLICT(environment_id,operation_kind,operation_id,observed_evidence_digest,evidence_kind) DO NOTHING`,[scope.environmentId,observation.kind,observation.id,observation.observedDigest,observation.observedAt,observation.evidenceKind,observation.kind==='ordinary_tokens'?observation.ceiling:null,observation.kind==='parity_dollars'?observation.ceiling:null,observation.kind==='ordinary_tokens'?observation.actual:null,observation.kind==='parity_dollars'?observation.actual:null,observation.settledAt,scope.snapshotDigest,snapshot.capturedAt,scope.recoveryId,scope.controlRevision,observation.observedDigestKind]);
   await db.query("UPDATE parity_evaluation_budgets SET state='closed' WHERE environment_id=$1 AND state='open' AND id IN(SELECT scope_id FROM operations_recovery_model_holds WHERE environment_id=$1 AND operation_kind='parity_dollars')",[scope.environmentId]);
  }
  // Restore authenticated immutable allowance metadata before fencing its old
  // insertion identity, within this same locked transaction. This does not
  // recreate any dispatched operation or weaken an existing replay guard.
  let permanentReplayFencesAdded=0;
  if(['pilot-denial-replay-snapshot-v4','pilot-denial-replay-snapshot-v5','pilot-denial-replay-snapshot-v6','pilot-denial-replay-snapshot-v7'].includes(snapshot.contract)){
   const replayEntries=snapshot.tables.map(entry=>({name:entry.name,replayKeyColumns:entry.replayKeyColumns??[],keys:entry.rows.flatMap(row=>row.replayKeys??[])}));
   const inheritedFence=z.strictObject({environment_id:z.string(),table_name:z.string().regex(/^[a-z_][a-z0-9_]*$/),key_columns:z.array(z.string().regex(/^[a-z_][a-z0-9_]*$/)).min(1).max(16),key_digest:z.string().regex(/^[a-f0-9]{64}$/)});
   for(const row of snapshot.tables.find(entry=>entry.name==='operations_replay_fences')?.rows??[]){
    const inherited=inheritedFence.parse(row.identity);if(inherited.environment_id!==scope.environmentId)throw Error('Inherited permanent replay scope differs');
    replayEntries.push({name:inherited.table_name,replayKeyColumns:[inherited.key_columns],keys:[{columns:inherited.key_columns,digest:inherited.key_digest}]});
   }
   for(const entry of replayEntries){
    if(!entry.replayKeyColumns.length)continue;
    const protectedTable=(await db.query("SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=$1 AND t.tgname='recovered_request_replay' AND t.tgenabled='O' AND t.tgfoid='turas_recovery_replay_guard'::regproc",[entry.name])).rowCount===1;
    if(!protectedTable)throw Error('Actual permanent replay guard unavailable');
    const targetKeys=(await db.query(`SELECT array_agg(a.attname::text ORDER BY a.attname) AS columns FROM pg_index i
     JOIN pg_class c ON c.oid=i.indrelid JOIN pg_namespace n ON n.oid=c.relnamespace
     CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY k(attnum,ordinal) JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=k.attnum
     WHERE n.nspname='public' AND c.relname=$1 AND i.indisunique AND i.indpred IS NULL AND i.indexprs IS NULL AND k.ordinal<=i.indnkeyatts GROUP BY i.indexrelid`,[entry.name])).rows.map(row=>JSON.stringify(row.columns));
    if(entry.replayKeyColumns.some(columns=>!targetKeys.includes(JSON.stringify(columns))))throw Error('Actual permanent replay index differs');
    for(const key of entry.keys){
     permanentReplayFencesAdded+=(await db.query(`INSERT INTO operations_replay_fences(environment_id,table_name,key_columns,key_digest,snapshot_digest,source_captured_at,recovery_id,control_revision)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(environment_id,table_name,key_columns,key_digest) DO NOTHING`,[scope.environmentId,entry.name,key.columns,key.digest,scope.snapshotDigest,snapshot.capturedAt,scope.recoveryId,scope.controlRevision])).rowCount??0;
    }
   }
  }
  const currentStateDigest=await currentRecoveryStateDigest(db);
  return {currentStateDigest,contract:'pilot-owned-credential-denials-v5' as const,...scope,mode:'locked' as const,revokedWorkspaces,revokedPartnerOrganizations,revokedPrincipals,revokedMemberships,revokedSessions,revokedMcpConnections,revokedGrants,clearedAcceptedHeads,withdrawnArtifacts,withdrawnResearch,retiredProjections,suspendedPublications,permanentReplayFencesAdded,typedModelHoldsAdded,sourcePublicationDenialsApplied:snapshot.contract!=='pilot-denial-replay-snapshot-v2',scope:'credentials-grants-and-source-denials' as const,authorityGranted:false,quarantineCleared:false,currentAuthorityVerified:false,replayReconciled:false,restorationReady:false};
}
