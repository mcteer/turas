import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {validateReportDocument} from '../../reports/document';
import {prepareReportMail} from './mail-content';
import {reportDigest} from './commands';
import {reportRevisionFence} from './release';
import {HttpFailure} from '../../contracts/http';
import {requireReportGlyphs,reportDocumentText} from './fonts';
export async function validateWeeklyRevision(db:PoolClient,workspaceId:string,revisionId:string){
 const revision=await reportRevisionFence(db,workspaceId,revisionId,{published:false});
 if(revision.kind!=='weekly')throw new HttpFailure(422,'invalid_input','Executive artifacts require rendering');
 const payload=(await db.query('SELECT document FROM report_revision_payloads WHERE revision_id=$1',[revisionId])).rows[0];
 const document=validateReportDocument(payload.document);
 if(reportDigest(document)!==revision.content_digest)throw new HttpFailure(409,'source_changed','Report content digest changed');
 const mail=prepareReportMail(document),stored=(await db.query('SELECT content_digest,html,plain_text FROM report_mail_payloads WHERE revision_id=$1',[revisionId])).rows[0];
 if(!stored || stored.content_digest!==mail.contentDigest || stored.html!==mail.html || stored.plain_text!==mail.plainText)throw new HttpFailure(409,'source_changed','Report mail digest changed');
 await requireReportGlyphs([...reportDocumentText(document),mail.plainText]);
 const id=randomUUID(),checks={sections:true,parity:true,escapedContent:true,bounds:true,remoteAssets:false,recipientMetadata:false};
 await db.query(`INSERT INTO report_validations(id,environment_id,workspace_id,customer_id,revision_id,document_digest,artifact_digests,mail_digest,validator_version,checks) VALUES($1,$2,$3,$4,$5,$6,'{}',$7,'report-validation-v1',$8)`,[id,process.env.TURAS_ENVIRONMENT_ID,workspaceId,revision.customer_id,revisionId,revision.content_digest,mail.contentDigest,JSON.stringify(checks)]);
 await db.query("UPDATE report_revision_states SET state='review_ready',updated_at=now() WHERE revision_id=$1 AND state IN ('draft','review_ready')",[revisionId]);
 return {validationId:id,documentDigest:revision.content_digest,mailDigest:mail.contentDigest};
}
