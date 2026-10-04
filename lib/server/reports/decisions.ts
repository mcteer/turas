import {randomUUID} from 'node:crypto';import type {PoolClient} from 'pg';import type {CurrentSession} from '../auth/sessions';import {z} from 'zod';
import {reportDigest} from './commands';import {lockReportActor} from './policy';import {reportId,reportDigestSchema} from './schema';
const decisionSchema=z.strictObject({action:z.enum(['publish','reject','withdraw','approve_brand','revoke_brand','approve_policy','pause_policy','resume_policy','revoke_policy','authorize_send','reconcile']),subjectId:reportId,expectedVersion:z.number().int().positive().safe(),previewDigest:reportDigestSchema,rationale:z.string().trim().min(1).max(2000),requestKey:reportId,revisionId:reportId.nullable().default(null)});
/** Minimal immutable audit keeps a digest; private rationale has its own bounded lifetime. */
export async function recordReportDecision(db:PoolClient,actor:CurrentSession,customerId:string,raw:z.input<typeof decisionSchema>){
 const input=decisionSchema.parse(raw);await lockReportActor(db,actor,customerId,'publish','delivery');const id=randomUUID();
 await db.query(`INSERT INTO report_decisions(id,environment_id,workspace_id,customer_id,actor_membership_id,action,subject_id,expected_version,preview_digest,rationale_digest,request_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,[id,process.env.TURAS_ENVIRONMENT_ID,actor.workspaceId,customerId,actor.membershipId,input.action,input.subjectId,input.expectedVersion,input.previewDigest,reportDigest({rationale:input.rationale}),input.requestKey]);
 await db.query(`INSERT INTO report_decision_payloads(decision_id,revision_id,rationale,expires_at) VALUES($1,$2,$3,now()+($4*interval '1 day'))`,[id,input.revisionId,input.rationale,['publish','authorize_send'].includes(input.action)?365:30]);return id;
}
