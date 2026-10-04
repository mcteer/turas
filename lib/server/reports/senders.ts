import type {PoolClient} from 'pg';
import {HttpFailure} from '../../contracts/http';
import {reportConfig} from './config';
import {reportDigest} from './commands';
import {normalizeReportAddress} from './recipients';
import {reportId} from './schema';
import {verifyReportSenderDomain,type ReportProviderFetch} from './resend';
export function configuredReportSender(){
 const config=reportConfig();
 if(!config.senderAddress || !config.senderDomainId || !config.senderId || !reportId.safeParse(config.senderId).success || !reportId.safeParse(config.senderDomainId).success)throw new HttpFailure(503,'sender_unavailable','Report sender is not configured');
 const address=normalizeReportAddress(config.senderAddress),digest=reportDigest({version:'report-sender-v1',address,domainId:config.senderDomainId,provider:'resend',openTracking:false,clickTracking:false});
 return {id:config.senderId,address,domainId:config.senderDomainId,digest,apiKey:config.apiKey};
}
/** Explicit operator preparation; this GET checks existing configuration without provisioning or changing DNS. */
export async function verifyConfiguredReportSender(providerFetch?:ReportProviderFetch){
 const sender=configuredReportSender();if(!sender.apiKey)throw new HttpFailure(503,'sender_unavailable','Report sender verification is unavailable');
 await verifyReportSenderDomain({apiKey:sender.apiKey,domainId:sender.domainId,senderAddress:sender.address},providerFetch);return sender;
}
export async function registerVerifiedReportSender(db:PoolClient,workspaceId:string,verified:Awaited<ReturnType<typeof verifyConfiguredReportSender>>){
 const current=configuredReportSender();if(current.digest!==verified.digest || current.id!==verified.id)throw new HttpFailure(409,'policy_changed','Sender configuration changed');
 // Row locking prevents dispatch from observing half a configuration change.
 const old=(await db.query('SELECT * FROM report_senders WHERE id=$1 FOR UPDATE',[current.id])).rows[0];
 if(old && (old.environment_id!==process.env.TURAS_ENVIRONMENT_ID || old.workspace_id!==workspaceId))throw new HttpFailure(409,'policy_changed','Sender identity is already in use');
 await db.query(`INSERT INTO report_senders(id,environment_id,workspace_id,config_ref,provider,config_digest,verified) VALUES($1,$2,$3,'TURAS_REPORT_SENDER_ADDRESS','resend',$4,true)
 ON CONFLICT(id) DO UPDATE SET config_digest=EXCLUDED.config_digest,verified=true,version=report_senders.version+CASE WHEN report_senders.config_digest=EXCLUDED.config_digest AND report_senders.verified THEN 0 ELSE 1 END`,[current.id,process.env.TURAS_ENVIRONMENT_ID,workspaceId,current.digest]);
 return {senderId:current.id};
}
export async function requireVerifiedReportSender(db:PoolClient,workspaceId:string,senderId:string){
 const configured=configuredReportSender();
 const row=(await db.query('SELECT id,version,config_digest,verified FROM report_senders WHERE id=$1 AND environment_id=$2 AND workspace_id=$3 FOR SHARE',[senderId,process.env.TURAS_ENVIRONMENT_ID,workspaceId])).rows[0];
 if(!row || !row.verified || configured.id!==row.id || configured.digest!==row.config_digest)throw new HttpFailure(503,'sender_unavailable','Verified report sender is unavailable');
 return {id:row.id,version:Number(row.version),digest:row.config_digest,address:configured.address};
}
