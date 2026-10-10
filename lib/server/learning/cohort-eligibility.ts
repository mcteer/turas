import type {PoolClient} from 'pg';
import type {CurrentSession} from '../auth/sessions';
import {HttpFailure} from '../../contracts/http';
import {learningMeasurementSchema} from '../../contracts/learning';
import {captureLearningMeasurementSources} from './measurement-sources';
import {learningHash} from './repository';
import {getServerConfig} from '../config';
/** The immutable whole-family manifest is checked before every disclosure. */
export async function learningCohortIsCurrent(db:PoolClient,actor:CurrentSession,releaseId:string,manifestDigest:string){
 const rows=(await db.query(`SELECT d.*,c.id AS contribution_id,c.state,c.head_revision_id,c.customer_id AS current_customer_id,r.content_digest,p.content,a.decision,a.reuse_approved,a.closure_digest AS approval_closure FROM learning_cohort_dependencies d JOIN learning_measurement_revisions r ON r.id=d.measurement_revision_id JOIN learning_measurement_contributions c ON c.id=r.contribution_id JOIN learning_measurement_approvals a ON a.id=d.approval_id LEFT JOIN learning_measurement_payloads p ON p.revision_id=r.id WHERE d.release_id=$1 AND c.environment_id=$2 AND c.workspace_id=$3 ORDER BY d.customer_id LIMIT 10001`,[releaseId,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId])).rows;
 if(rows.length<5||rows.length>10000||new Set(rows.map(row=>row.customer_id)).size!==rows.length)return false;
 const manifest=rows.map(row=>({customerId:String(row.customer_id),revisionId:String(row.measurement_revision_id),approvalId:String(row.approval_id),closureDigest:String(row.closure_digest)}));if(learningHash(manifest)!==manifestDigest)return false;
 for(const row of rows){
  if(row.state!=='approved'||row.head_revision_id!==row.measurement_revision_id||row.current_customer_id!==row.customer_id||row.decision!=='approve'||!row.reuse_approved||row.approval_closure!==row.closure_digest||!row.content||learningHash(row.content)!==row.content_digest)return false;
  const parsed=learningMeasurementSchema.safeParse(row.content);if(!parsed.success)return false;
  try{const captured=await captureLearningMeasurementSources(db,actor,parsed.data);if(captured.closureDigest!==row.closure_digest)return false;}catch(error){if(error instanceof HttpFailure&&error.status<500)return false;throw error;}
 }
 return true;
}
export async function withholdLearningMeasurementFamilies(db:PoolClient,revisionId:string){
 await db.query(`UPDATE learning_cohort_families f SET state='withheld',withheld_at=COALESCE(withheld_at,clock_timestamp()),version=version+1 FROM learning_cohort_releases r JOIN learning_cohort_dependencies d ON d.release_id=r.id WHERE r.family_id=f.id AND d.measurement_revision_id=$1 AND f.state='released'`,[revisionId]);
}
export async function withholdLearningCohort(db:PoolClient,familyId:string){
 await db.query("UPDATE learning_cohort_families SET state='withheld',withheld_at=COALESCE(withheld_at,clock_timestamp()),version=version+1 WHERE id=$1 AND state='released'",[familyId]);
}
