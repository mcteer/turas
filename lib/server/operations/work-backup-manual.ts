import {z} from 'zod';
import type {Client} from 'pg';
import {recoveryDigest} from '../../contracts/pilot-recovery';
const digest=z.string().regex(/^[a-f0-9]{64}$/);
export const reviewedManualBackupSchema=z.strictObject({
 contract:z.literal('pilot-work-backup-reviewed-manual-v1'),id:z.uuid(),
 installationId:z.uuid(),sourceProjectId:z.string().regex(/^prj_[A-Za-z0-9]+$/),previousScopeDigest:digest,environmentId:z.string().min(1).max(256),
 previousOperationDigest:digest,previousReservationIds:z.tuple([z.uuid(),z.uuid()]),
 previousOperatorReviewDigest:digest,previousChargeEvidenceDigest:digest,
 currentScopeDigest:digest,currentConfigurationDigest:digest,currentSourceCommit:z.string().regex(/^[a-f0-9]{40}$/),currentSourceDigest:digest,currentCatalogDigest:digest,hostingBudgetId:z.uuid(),blobBudgetId:z.uuid(),
 operatorReviewDigest:digest,recordedAt:z.iso.datetime({offset:true}),expiresAt:z.iso.datetime({offset:true}),
 maximumCaptureRequests:z.literal(1),automaticRetry:z.literal(false),scheduledSlotSucceeded:z.literal(false),
}).refine(value=>value.previousReservationIds[0]!==value.previousReservationIds[1],'Distinct exact prior reservations required');

/** A protected, separately reviewed operation, never a replay or replacement of
 * the scheduled slot. Ordinary reservation admission still enforces once-only
 * use across budgets. Successful-capture cadence remains checked by the runner. */
export async function reviewedManualBackupOperation(db:Client,raw:unknown,scope:{installationId:string;environmentId:string;sourceProjectId:string;scopeDigest:string;configurationDigest:string;sourceCommit:string;sourceDigest:string;catalogDigest:string;hostingBudgetId:string;blobBudgetId:string},now=Date.now()){
 const review=reviewedManualBackupSchema.parse(raw),recorded=Date.parse(review.recordedAt),expiry=Date.parse(review.expiresAt);
 if(review.currentScopeDigest!==scope.scopeDigest||review.currentConfigurationDigest!==scope.configurationDigest||review.currentSourceCommit!==scope.sourceCommit||review.currentSourceDigest!==scope.sourceDigest||review.currentCatalogDigest!==scope.catalogDigest||review.hostingBudgetId!==scope.hostingBudgetId||review.blobBudgetId!==scope.blobBudgetId||review.installationId!==scope.installationId||review.environmentId!==scope.environmentId||review.sourceProjectId!==scope.sourceProjectId||recorded>now||expiry<=now+300000||expiry-recorded>3600000||expiry<=recorded)throw Error('Applicable finite manual backup review required');
 if((await db.query("SELECT current_user=pg_get_userbyid(relowner) AS owner FROM pg_class WHERE oid='turas_backup.cost_reconciliations'::regclass")).rows[0]?.owner!==true)throw Error('Actual independent manual review owner required');
 const rows=(await db.query(`SELECT r.id,r.state,r.operation_digest,r.upper_bound_micro_usd,r.charged_micro_usd,r.charge_kind,
  b.installation_id,b.environment_id,b.scope_digest,b.category,c.operator_review_digest,c.charge_evidence_digest,
  c.charged_micro_usd AS reviewed_charge,c.charge_kind AS reviewed_kind,c.installation_id AS reviewed_installation,c.environment_id AS reviewed_environment,c.operation_digest AS reviewed_operation
  FROM turas_backup.cost_reservations r JOIN turas_backup.cost_budgets b ON b.id=r.budget_id
  JOIN turas_backup.cost_reconciliations c ON c.reservation_id=r.id
  WHERE r.id=ANY($1::uuid[])`,[review.previousReservationIds])).rows;
 if(rows.length!==2||new Set(rows.map(row=>row.id)).size!==2||new Set(rows.map(row=>row.category)).size!==2||rows.some(row=>!review.previousReservationIds.includes(row.id)||row.scope_digest!==review.previousScopeDigest||!['hosting','blob'].includes(row.category)||row.installation_id!==scope.installationId||row.environment_id!==scope.environmentId||row.operation_digest!==review.previousOperationDigest||row.reviewed_installation!==scope.installationId||row.reviewed_environment!==scope.environmentId||row.reviewed_operation!==review.previousOperationDigest||row.state!=='settled'||row.charge_kind!=='estimate'||row.reviewed_kind!=='estimate'||Number(row.charged_micro_usd)!==Number(row.upper_bound_micro_usd)||Number(row.reviewed_charge)!==Number(row.upper_bound_micro_usd)||row.operator_review_digest!==review.previousOperatorReviewDigest||row.charge_evidence_digest!==review.previousChargeEvidenceDigest))throw Error('Exact full prior backup cost review required');
 // Neither a new budget, changed expiry nor altered review can reuse this ID.
 return {review,operationDigest:recoveryDigest({contract:review.contract,id:review.id,installationId:scope.installationId})};
}
