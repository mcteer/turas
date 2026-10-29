import type {Client,PoolClient} from 'pg';
import {z} from 'zod';
import {recoveryDigest} from '../../contracts/pilot-recovery';
import {getOwnedConversation} from '../conversations/repository';
import {withAuthenticatedWorkRecoveryRead,withAuthenticatedWorkParticipantRead} from './authenticated-recovery-read';
import {requireLockedWorkRecoveryConnection,isWorkRecoveryDecisionClient,type LockedWorkRecoveryTarget} from './locked-work-recovery-target';
import {currentRecoveryStateDigest} from './recovery-state';
const credentials=z.strictObject({mcteer:z.string().min(1).max(4096),panel:z.string().min(1).max(4096),partner:z.string().min(1).max(4096)});
const usernames=['mcteer','panel','partner'] as const;
type Observation={id:string;username:string;projection?:string;denied?:404;ownerDenied?:404};
const audited=new WeakMap<object,{db:Client;targetDigest:string;currentStateDigest:string;observations:readonly Observation[]}>();
const targetDigest=(target:LockedWorkRecoveryTarget)=>{const {deadline,contract,...identity}=target;return recoveryDigest(identity);};
/** Actual canonical private-reference reads on the final owner transaction.
 * Credentials authenticate independently; neither an owner connection nor a
 * supplied role/healthy flag can stand in for an application participant. */
export async function auditRecoveryConversationReads(db:Client,target:LockedWorkRecoveryTarget,raw:z.infer<typeof credentials>,journalDirectory:string){
 if(!isWorkRecoveryDecisionClient(db))throw Error('Genuine recovery decision required for conversation reads');
 const passwords=credentials.parse(raw),scope={environmentId:target.environmentId,recoveryId:target.recoveryId,controlRevision:target.controlRevision};
 await requireLockedWorkRecoveryConnection(db,target,scope);
 await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,16020))',[target.environmentId]);
 await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,16017))',[target.environmentId]);await currentRecoveryStateDigest(db);
 const rows=(await db.query(`SELECT c.id,c.workspace_id,c.owner_principal_id,p.login_name FROM conversations c
  JOIN principals p ON p.id=c.owner_principal_id WHERE c.environment_id=$1 ORDER BY c.workspace_id,c.id LIMIT 10001`,[target.environmentId])).rows;
 if(rows.length>10000||rows.some(row=>!usernames.includes(row.login_name)))throw Error('Complete supported private conversation owner inventory required');
 const observations:Observation[]=[],probes:string[]=[];let ownReads=0,foreignDenials=0,unavailableOwners=0,restrictedOwnerDenials=0;
 const client=db as unknown as PoolClient;
 for(const workspaceId of [...new Set<string>(rows.map(row=>row.workspace_id))]){
  const records=rows.filter(row=>row.workspace_id===workspaceId);
  const members=(await db.query(`SELECT p.login_name,m.active AND p.active AND w.active AND
   (m.kind='internal' OR EXISTS(SELECT 1 FROM partner_organizations o WHERE o.id=m.partner_org_id AND o.workspace_id=m.workspace_id AND o.active)) AS eligible
   FROM memberships m JOIN principals p ON p.id=m.principal_id JOIN workspaces w ON w.id=m.workspace_id
   WHERE m.workspace_id=$1 AND p.login_name=ANY($2::text[]) ORDER BY p.login_name`,[workspaceId,[...usernames]])).rows;
  for(const username of usernames){
   if(members.find(row=>row.login_name===username)?.eligible!==true){unavailableOwners+=records.filter(row=>row.login_name===username).length;continue;}
   const deadline=Math.min(target.deadline,Date.now()+59000),request={...scope,workspaceId,deadline,password:passwords[username]};
   const read=async(actor:import('../auth/sessions').CurrentSession)=>{
    probes.push(actor.sessionId);
    for(const record of records){
     if(Date.now()>=deadline)throw Error('Conversation authorization deadline ended');
     if(record.owner_principal_id===actor.principalId){
      try{const result=await getOwnedConversation(actor,record.id,client);observations.push({id:record.id,username,projection:recoveryDigest(result)});ownReads++;}
      catch(error){
       // Ownership does not revive a withdrawn customer grant. Retain the
       // exact canonical denial; transport/schema/authentication failures fail.
       if(!(error instanceof Error)||!('status'in error)||error.status!==404)throw error;
       observations.push({id:record.id,username,ownerDenied:404});restrictedOwnerDenials++;
      }
     }
     else{
      try{await getOwnedConversation(actor,record.id,client);throw Error('Foreign private conversation was readable');}
      catch(error){if(!(error instanceof Error)||!('status'in error)||error.status!==404)throw error;}
      observations.push({id:record.id,username,denied:404});foreignDenials++;
     }
    }
   };
   if(username==='mcteer')await withAuthenticatedWorkRecoveryRead(db,target,request,journalDirectory,read);
   else await withAuthenticatedWorkParticipantRead(db,target,{...request,username},journalDirectory,read);
  }
 }
 for(const id of probes)if((await db.query('SELECT revoked_at IS NOT NULL AS retired FROM login_sessions WHERE id=$1',[id])).rows[0]?.retired!==true)throw Error('Conversation probe retirement unavailable');
 if(ownReads+restrictedOwnerDenials+unavailableOwners!==rows.length)throw Error('Complete private conversation disposition required');
 await requireLockedWorkRecoveryConnection(db,target,scope);
 const proof=Object.freeze({contract:'pilot-recovery-conversation-reads-v1' as const,...scope,inventoryDigest:recoveryDigest(rows),authorizationDigest:recoveryDigest(observations),conversations:rows.length,ownReads,foreignDenials,unavailableOwners,restrictedOwnerDenials,probeRetirementVerified:true as const,conversationAuthorizationVerified:true as const,authenticatedHttpVerified:false as const,requiredScopeHealthy:false as const,restorationReady:false as const});
 audited.set(proof,{db,targetDigest:targetDigest(target),currentStateDigest:await currentRecoveryStateDigest(db),observations:Object.freeze(observations.map(row=>Object.freeze(row)))});return proof;
}

/** Only observations actually measured on this still-active final transaction
 * may be matched to HTTP coverage. JSON copies never recreate that authority. */
export async function requireAuditedRecoveryConversationReads(db:Client,target:LockedWorkRecoveryTarget,proof:Awaited<ReturnType<typeof auditRecoveryConversationReads>>){
 const actual=audited.get(proof);
 if(!actual||actual.db!==db||!isWorkRecoveryDecisionClient(db)||actual.targetDigest!==targetDigest(target))throw Error('Genuine current canonical conversation observations required');
 if(actual.currentStateDigest!==await currentRecoveryStateDigest(db))throw Error('Canonical conversation authorization state changed');
 return actual.observations;
}
