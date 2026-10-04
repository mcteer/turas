import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import type {CurrentSession} from '../auth/sessions';
import {reportDigest} from './commands';
import {HttpFailure} from '../../contracts/http';
export async function createReportPreview(db:PoolClient,actor:CurrentSession,customerId:string,subjectId:string,kind:'publication'|'send'|'brand'|'policy',expectedVersion:number,binding:unknown){
 const id=randomUUID(),digest=reportDigest(binding);
 const row=(await db.query(`INSERT INTO report_previews(id,environment_id,workspace_id,customer_id,actor_membership_id,subject_id,kind,expected_version,binding_digest,expires_at)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,now()+interval '5 minutes') RETURNING expires_at`,[id,process.env.TURAS_ENVIRONMENT_ID,actor.workspaceId,customerId,actor.membershipId,subjectId,kind,expectedVersion,digest])).rows[0];
 return {previewId:id,previewDigest:digest,expectedVersion,expiresAt:row.expires_at};
}
export async function requireReportPreview(db:PoolClient,actor:CurrentSession,subjectId:string,kind:string,id:string,digest:string,version:number,binding:unknown){
 const row=(await db.query(`SELECT binding_digest FROM report_previews WHERE id=$1 AND environment_id=$2 AND workspace_id=$3 AND actor_membership_id=$4 AND subject_id=$5 AND kind=$6 AND expected_version=$7 AND expires_at>now()`,[id,process.env.TURAS_ENVIRONMENT_ID,actor.workspaceId,actor.membershipId,subjectId,kind,version])).rows[0];
 if(!row || row.binding_digest!==digest)throw new HttpFailure(409,'preview_expired','Preview expired or changed');
 if(row.binding_digest!==reportDigest(binding))throw new HttpFailure(409,'source_changed','Reviewed inputs changed');
}
