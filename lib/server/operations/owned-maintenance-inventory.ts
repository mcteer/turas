import {withOwnedRestoreTarget,requireOwnedRestoreConnection,verifyOwnedRestoredRequiredObjects,type OwnedRestoreTarget} from './owned-restore-target';
import {requiredRecoveryObjects} from './required-objects';
import {recoveryDigest} from '../../contracts/pilot-recovery';
import {objectKey,type ObjectDescriptor,type ObjectNamespace} from '../storage/private-objects';
import {DEMO_IDS} from '../bootstrap-ids';
import {z} from 'zod';

type Scope={environmentId:string;recoveryId:string;controlRevision:number};
export type OwnedMaintenanceRecord=Readonly<{kind:'profile'|'artifact'|'report'|'workforce'|'gap'|'plan';recordId:string;workspaceId:string;customerId:string|null;membershipId:string;generation:string;parentId:string|null;object:Readonly<ObjectDescriptor>|null}>;
type Row=Record<string,unknown>;
const id=(value:unknown)=>z.uuid().parse(value);
const generation=(value:unknown)=>z.string().regex(/^\d+$/).parse(String(value));
/** Inventory is derived before owner filtering. Unsupported active originals
 * fail explicitly instead of quietly reducing maintenance coverage. */
export function deriveOwnedMaintenanceInventory(target:OwnedRestoreTarget,scope:Scope,signal:AbortSignal){
 return withOwnedRestoreTarget(target,scope,signal,async db=>{
  await db.query('BEGIN ISOLATION LEVEL READ COMMITTED');
  try{
   const inventory=await deriveOwnedMaintenanceInventoryInTransaction(db,target,scope,signal);
   signal.throwIfAborted();await db.query('COMMIT');return inventory;
  }catch(error){await db.query('ROLLBACK');throw error;}
 });
}
/** Caller retains this READ COMMITTED transaction and its ordered decision
 * fences until the consuming recovery decision commits. */
export async function deriveOwnedMaintenanceInventoryInTransaction(db:import('pg').Client,target:OwnedRestoreTarget,scope:Scope,signal:AbortSignal){
 await requireOwnedRestoreConnection(db,target,scope,signal);
 await db.query('SELECT pg_current_xact_id()');
 const transaction=(await db.query("SELECT pg_current_xact_id_if_assigned() IS NOT NULL AS active,current_setting('transaction_isolation') AS isolation")).rows[0];
 if(!transaction?.active||transaction.isolation!=='read committed')throw Error('Maintenance inventory requires an active read committed decision transaction');
   await db.query("SET LOCAL lock_timeout='3000ms'; SET LOCAL statement_timeout='10000ms'; SET LOCAL transaction_timeout='60s'");
   await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,16020))',[scope.environmentId]);
   await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,16017))',[scope.environmentId]);
   const originals=await verifyOwnedRestoredRequiredObjects(db,target,scope,signal),required=await requiredRecoveryObjects(db,scope.environmentId);
   if(recoveryDigest(required)!==originals.requiredObjectsDigest)throw Error('Required maintenance original inventory changed');
   const objects=new Map(required.map(object=>[object.key,object])),classified=new Map<string,string>(),records:OwnedMaintenanceRecord[]=[];
   for(const object of required)if(/\/(artifact-staging|workforce-staging)\//.test(object.key))classified.set(object.key,'staging');
   const administrators=(await db.query(`SELECT m.workspace_id,m.id FROM memberships m JOIN principals p ON p.id=m.principal_id JOIN workspaces w ON w.id=m.workspace_id
    WHERE m.active AND m.kind='internal' AND m.role='admin' AND p.active AND p.id=$1 AND p.login_name='mcteer' AND w.active
     AND (w.classification='primary' OR w.pilot_environment_id=$2) LIMIT 257`,[DEMO_IDS.mcteer,scope.environmentId])).rows;
   if(administrators.length>256)throw Error('Maintenance workspace inventory exceeds bound');
   const memberships=new Map<string,string>();
   for(const row of administrators){const workspace=id(row.workspace_id);if(memberships.has(workspace))throw Error('Ambiguous maintenance administrator');memberships.set(workspace,id(row.id));}
   let ledgerRecords=0;
   async function rows(sql:string):Promise<Row[]>{signal.throwIfAborted();const result=(await db.query(sql+' LIMIT 1025',[scope.environmentId])).rows;ledgerRecords+=result.length;if(result.length>1024||ledgerRecords>1024)throw Error('Maintenance ledger inventory exceeds bound');return result;}
   function physical(namespace:ObjectNamespace,row:Row){
    const key=objectKey(scope.environmentId,namespace,String(row.object_id)),actual=objects.get(key);
    if(!actual||actual.digest!==row.digest||actual.sizeBytes!==Number(row.size_bytes))throw Error('Maintenance record and required original differ');return actual;
   }
   function record(kind:OwnedMaintenanceRecord['kind'],row:Row,object:ObjectDescriptor|null,customerId:string|null,parentId:string|null=null){
    const workspaceId=id(row.workspace_id),membershipId=memberships.get(workspaceId);if(!membershipId)throw Error('Active maintenance workspace lacks authenticated owner scope');
    const value=Object.freeze({kind,recordId:id(row.record_id),workspaceId,customerId,membershipId,generation:generation(row.generation),parentId,object:object?Object.freeze({...object}):null});
    if(records.some(prior=>prior.kind===value.kind&&prior.recordId===value.recordId))throw Error('Ambiguous maintenance record');
    records.push(value);if(records.length>256)throw Error('Maintenance service inventory exceeds bound');if(object)classified.set(object.key,'maintenance-candidate');
   }
   const profiles=await rows(`SELECT c.id AS record_id,c.workspace_id,p.internal_generation AS generation FROM customer_profile_state p
    JOIN customer_references c ON c.id=p.customer_id AND c.workspace_id=p.workspace_id JOIN workspaces w ON w.id=c.workspace_id
    WHERE w.active AND EXISTS(SELECT 1 FROM turas_environment WHERE environment_id=$1)`);
   for(const row of profiles)record('profile',row,null,id(row.record_id));
   const plans=await rows(`SELECT p.id AS record_id,p.workspace_id,p.customer_id,p.aggregate_version AS generation,p.accepted_revision_id AS revision_id
    FROM delivery_plans p JOIN workspaces w ON w.id=p.workspace_id
    WHERE p.environment_id=$1 AND w.active AND p.accepted_revision_id IS NOT NULL`);
   for(const row of plans)record('plan',row,null,id(row.customer_id),id(row.revision_id));
   const artifacts=await rows(`SELECT v.id AS record_id,v.workspace_id,v.customer_id,v.object_key::text AS object_id,v.sha256_digest AS digest,v.actual_size_bytes AS size_bytes,
    v.lifecycle_generation AS generation,v.state,v.owner_principal_id,v.submitted_at IS NOT NULL AS submitted,w.active,
    EXISTS(SELECT 1 FROM artifact_extraction_runs r WHERE r.version_id=v.id AND r.state='published') AS published
    FROM artifact_versions v JOIN workspaces w ON w.id=v.workspace_id WHERE v.environment_id=$1 AND v.state NOT IN('cancelled','deleting','deleted')`);
   for(const row of artifacts){const object=physical('artifact',row);if(!row.active){classified.set(object.key,'inactive-workspace');continue;}
    if(!['ready','partial'].includes(String(row.state))||!row.published){classified.set(object.key,'artifact-not-published');continue;}
    if(row.owner_principal_id!==DEMO_IDS.mcteer&&!row.submitted)throw Error('Private artifact owner maintenance unsupported');record('artifact',row,object,id(row.customer_id));}
   const workforce=await rows(`SELECT i.id AS record_id,v.workspace_id,v.object_key AS object_id,v.content_digest AS digest,v.byte_size AS size_bytes,
    s.generation,v.generation AS version_generation,s.state,s.id AS parent_id,s.current_version_id=v.id AS current_version,i.owner_membership_id,i.state AS intent_state,w.active,
    EXISTS(SELECT 1 FROM workforce_extractions x WHERE x.source_version_id=v.id AND x.scan_clean) AS clean
    FROM workforce_source_versions v JOIN workforce_sources s ON s.id=v.source_id AND s.environment_id=v.environment_id AND s.workspace_id=v.workspace_id
    JOIN workforce_source_payloads p ON p.revision_id=v.id JOIN workspaces w ON w.id=v.workspace_id
    LEFT JOIN workforce_import_intents i ON i.source_id=s.id AND i.environment_id=v.environment_id AND i.workspace_id=v.workspace_id
    WHERE v.environment_id=$1 AND s.state NOT IN('cancelled','withdrawn','deleting','deleted')`);
   for(const row of workforce){const object=physical('workforce',row);if(!row.active||!row.current_version||!['ready','partial','reviewed'].includes(String(row.state))){classified.set(object.key,'workforce-not-current-ready');continue;}
    if(!row.clean||row.intent_state!=='completed'||String(row.object_id)!==row.record_id||String(row.version_generation)!==String(row.generation))throw Error('Current workforce maintenance identity incomplete');
    if(row.owner_membership_id!==memberships.get(id(row.workspace_id)))throw Error('Workforce owner maintenance unsupported');record('workforce',row,object,null,id(row.parent_id));}
   const reports=await rows(`SELECT o.object_key::text AS object_id,o.content_digest AS digest,o.size_bytes,o.state AS object_state,o.revision_id AS store_revision_id,a.id AS record_id,a.workspace_id,a.customer_id,a.revision_id AS artifact_revision_id,a.content_digest AS artifact_digest,a.size_bytes AS artifact_size,
    a.validation_id,v.revision_number AS generation,v.report_id AS parent_id,st.state,w.active
    FROM report_store_objects o LEFT JOIN report_artifacts a ON a.object_key=o.object_key AND a.environment_id=o.environment_id
    LEFT JOIN report_revisions v ON v.id=a.revision_id LEFT JOIN report_revision_states st ON st.revision_id=v.id LEFT JOIN workspaces w ON w.id=a.workspace_id
    WHERE o.environment_id=$1 AND o.state IN('staged','finalized')`);
   for(const row of reports){const object=physical('report',row);if(row.record_id&&(row.artifact_digest!==row.digest||Number(row.artifact_size)!==object.sizeBytes||row.artifact_revision_id!==row.store_revision_id))throw Error('Report original artifact identity differs');if(row.object_state==='staged'){classified.set(object.key,'report-staged');continue;}
    if(!row.record_id)throw Error('Finalized report original lacks artifact');if(!row.active||!['review_ready','published'].includes(String(row.state))){classified.set(object.key,'report-not-review-ready');continue;}
    if(!row.validation_id)throw Error('Readable report lacks validation');record('report',row,object,id(row.customer_id),id(row.parent_id));}
   const gaps=await rows(`SELECT o.object_key::text AS object_id,o.content_digest AS digest,o.size_bytes,o.state AS object_state,o.workspace_id,o.revision_id AS store_revision_id,
    a.id AS artifact_id,a.content_digest AS artifact_digest,a.size_bytes AS artifact_size,a.report_id AS artifact_report_id,a.revision_id AS artifact_revision_id,
    r.id AS parent_id,rev.id AS revision_id,r.current_revision_id,r.approved_review_id,r.version AS generation,w.active
    FROM gap_report_store_objects o LEFT JOIN gap_export_artifacts a ON a.object_key=o.object_key AND a.environment_id=o.environment_id AND a.workspace_id=o.workspace_id
    LEFT JOIN gap_report_revisions rev ON rev.id=o.revision_id AND rev.environment_id=o.environment_id AND rev.workspace_id=o.workspace_id
    LEFT JOIN gap_reports r ON r.id=rev.report_id AND r.environment_id=rev.environment_id AND r.workspace_id=rev.workspace_id LEFT JOIN workspaces w ON w.id=o.workspace_id
    WHERE o.environment_id=$1 AND o.state IN('staged','attached','quarantined')`);
   for(const row of gaps){const object=physical('gap-report',row);
    if(row.artifact_id&&(row.artifact_digest!==row.digest||Number(row.artifact_size)!==object.sizeBytes||row.artifact_revision_id!==row.store_revision_id||row.artifact_report_id!==row.parent_id))throw Error('Gap original artifact identity differs');
    if(row.object_state==='staged'){classified.set(object.key,'gap-staged');continue;}
    if(!row.active||!row.revision_id||row.revision_id!==row.current_revision_id||!row.approved_review_id){classified.set(object.key,'gap-not-current-approved');continue;}
    if(!row.artifact_id)throw Error('Current approved gap original lacks artifact authority');
    const membership=memberships.get(id(row.workspace_id));if(!membership)throw Error('Current gap owner scope unavailable');
    const receipts=(await db.query(`SELECT e.id FROM gap_export_receipts e JOIN gap_report_reviews review ON review.id=e.review_id
     WHERE e.environment_id=$1 AND e.workspace_id=$2 AND e.artifact_id=$3 AND e.report_id=$4 AND e.review_id=$5 AND e.actor_membership_id=$6
      AND e.state<>'cancelled' AND e.content_digest=$7 AND e.size_bytes=$8 AND review.action='approve' AND review.revision_id=$9 AND review.audience_digest=e.audience_digest
     ORDER BY e.id LIMIT 1`,[scope.environmentId,row.workspace_id,row.artifact_id,row.parent_id,row.approved_review_id,membership,row.digest,row.size_bytes,row.revision_id])).rows;
    if(receipts.length!==1)throw Error('Current gap original lacks owner export authority');record('gap',{...row,record_id:receipts[0].id},object,null,id(row.parent_id));}
   for(const item of records)if(item.object)classified.set(item.object.key,'maintenance-candidate');
   if(required.some(object=>!classified.has(object.key)))throw Error('Required original lacks maintenance classification');
   records.sort((a,b)=>[a.kind,a.workspaceId,a.recordId].join(':').localeCompare([b.kind,b.workspaceId,b.recordId].join(':')));
   const physicalClassifications=required.map(object=>({key:object.key,classification:classified.get(object.key)!}));
   const inventoryDigest=recoveryDigest({scope,records,physicalClassifications,requiredObjectsDigest:originals.requiredObjectsDigest});
   signal.throwIfAborted();
   return Object.freeze({contract:'pilot-owned-maintenance-inventory-v1' as const,...scope,inventoryDigest,records:Object.freeze(records),physicalClassifications:Object.freeze(physicalClassifications),requiredOriginals:originals,requiredScopeHealthy:false as const,restorationReady:false as const});
}
