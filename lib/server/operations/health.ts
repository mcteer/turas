import {readOperationalDatabaseBinding} from './database-binding';
import {readPrivateStoreHealth} from './store-observations';
import {readHostedImageHealth} from './image-health';
import {readVerifiedBackupHealth} from './backup-health';
import {readCapacityHealth,readHostedDispatchHealth} from './capacity-health';
import {getServerConfig} from '../config';
import {withTransaction} from '../db/client';
import {assertPilotDatabaseEnvironment} from '../db/readiness';
import {operationalCodeVersion} from './code-version';
import {assessMaintenanceHealth,type MaintenanceObservation} from './maintenance-health';
import {isCanonicalAdmin} from '../access/admin-guard';
import {getCurrentSession} from '../auth/sessions';
import {HttpFailure} from '../../contracts/http';
import {readHostedConfiguration} from './hosted-configuration';
import {readHostedLearningConfiguration} from '../learning/hosted-admission';
import {readHostedRootConfiguration} from '../conversations/hosted-root-budget';
/** Identity is resolved from an actual current bound session, including while
 * recovery is locked. Neither bearer MCP nor supplied admin claims qualify. */
export async function requireOperationsAdministrator(request:Request){
 const actor=await getCurrentSession(request,'operations-status');
 if(!actor)throw new HttpFailure(401,'authentication_required','Sign in required');
 if(!isCanonicalAdmin(actor)||actor.loginName!=='mcteer')throw new HttpFailure(403,'forbidden','Action not allowed');
 return actor;
}
/** Read-only bounded diagnostics: anonymous polling cannot create health samples
 * or advance completion timestamps. Missing infrastructure acceptance remains
 * explicit until its actual producer/verifier is implemented; never infer it
 * from credentials, immutable-image strings, or another worker's heartbeat. */
export async function readOperationalHealth(){
 let databaseHealthy=false;
 try{await assertPilotDatabaseEnvironment();databaseHealthy=true;}catch{}
 if(!databaseHealthy)return {ready:false,database:'unavailable' as const,admission:'unavailable' as const,maintenance:null,stores:'unverified' as const,images:'unverified' as const,backups:'unverified' as const};
 try{
  const codeVersion=operationalCodeVersion(),environmentId=getServerConfig().TURAS_ENVIRONMENT_ID;
  const observed=await withTransaction(async db=>{
   await db.query("SET LOCAL statement_timeout='5000ms'");await db.query("SET LOCAL transaction_timeout='15s'");
   const rows=(await db.query<MaintenanceObservation>('SELECT class_id,last_success_at,last_completed_at,safe_failure,code_version,duration_ms,backlog_count,backlog_truncated,oldest_due_at FROM operations_maintenance_status WHERE environment_id=$1',[environmentId])).rows;
   const control=(await db.query('SELECT mode FROM operations_control WHERE environment_id=$1',[environmentId])).rows[0];
   const quarantinedScopes=(await db.query(`SELECT DISTINCT q.scope_kind FROM operations_recovery_quarantines q WHERE q.environment_id=$1
    AND NOT EXISTS(SELECT 1 FROM operations_recovery_quarantine_resolutions r JOIN operations_recovery_verifications v ON v.id=r.verification_id JOIN operations_control c ON c.environment_id=v.environment_id
     WHERE r.environment_id=q.environment_id AND r.recovery_id=q.recovery_id AND r.scope_kind=q.scope_kind
     AND v.recovery_id=c.recovery_id AND v.bundle_digest=c.verified_bundle_digest
     AND v.control_revision=c.revision-CASE WHEN c.mode='open' THEN 1 ELSE 0 END
     AND v.required_scope_healthy AND v.integrity_verified AND v.denial_verified AND v.replay_verified AND v.workflow_verified)
    ORDER BY q.scope_kind`,[environmentId])).rows.map(row=>String(row.scope_kind));
   const now=Number((await db.query('SELECT extract(epoch FROM clock_timestamp())*1000 AS now')).rows[0].now);
   return {connectionBinding:await readOperationalDatabaseBinding(db,{connection:getServerConfig().DATABASE_URL,environmentId,codeVersion}),dispatch:await readHostedDispatchHealth(db,environmentId),deployment:{codeVersion},...await readCapacityHealth(db,environmentId),admission:control?.mode==='open'?'open' as const:'closed' as const,recovery:{quarantinedScopes,requiredScopesQuarantined:quarantinedScopes.length},maintenance:assessMaintenanceHealth(rows,now,codeVersion),stores:await readPrivateStoreHealth(db,environmentId,codeVersion),images:await readHostedImageHealth(db,environmentId,codeVersion),backups:await readVerifiedBackupHealth(db,environmentId,codeVersion)};
  });
  const ready=observed.dispatch==='ready'&&!observed.costs.truncated&&observed.costs.budgets.every(budget=>budget.unknownReservations===0)&&observed.admission==='open'&&observed.recovery.requiredScopesQuarantined===0&&observed.maintenance.healthy&&observed.stores==='healthy'&&observed.images==='healthy'&&observed.backups==='healthy';
  return {ready,database:'healthy' as const,...observed,configuration:readHostedConfiguration(),rootAcceptanceConfiguration:readHostedRootConfiguration(),learningAcceptanceConfiguration:readHostedLearningConfiguration()};
 }catch{return {ready:false,database:'healthy' as const,admission:'unavailable' as const,maintenance:null,stores:'unverified' as const,images:'unverified' as const,backups:'unverified' as const};}
}
