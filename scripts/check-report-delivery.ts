import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {z} from 'zod';
import {reportId,reportDigestSchema} from '../lib/server/reports/schema';
import {reportConfig} from '../lib/server/reports/config';
import {reportTransaction} from '../lib/server/reports/commands';
import {claimReportDeliveries,dispatchReportDelivery,requireReportDeliveryAuthority} from '../lib/server/reports/outbox';
import {verifyConfiguredReportSender} from '../lib/server/reports/senders';
import {retrieveReportMail} from '../lib/server/reports/resend';
import {reportsSourceDigest} from './reports-source';
import {closeRuntimePool} from '../lib/server/db/client';

const inputSchema=z.strictObject({deliveryId:reportId,payloadDigest:reportDigestSchema,recipientDigest:reportDigestSchema});
export function parseControlledReportDeliveryArgs(args:readonly string[]){
 if(args.length!==5||args.filter(arg=>arg==='--live').length!==1||args.filter(arg=>arg==='--synthetic-test').length!==1)throw new Error('Explicit live synthetic-test authorization and exact identities required');
 const fields:Record<string,string>={};
 for(const arg of args){if(arg==='--live'||arg==='--synthetic-test')continue;const match=/^--(delivery-id|payload-digest|recipient-digest)=(.+)$/.exec(arg);if(!match||fields[match[1]])throw new Error('Invalid controlled delivery arguments');fields[match[1]]=match[2];}
 return inputSchema.parse({deliveryId:fields['delivery-id'],payloadDigest:fields['payload-digest'],recipientDigest:fields['recipient-digest']});
}
async function main(){
 const input=parseControlledReportDeliveryArgs(process.argv.slice(2)),config=reportConfig();
 if(!config.deliveryEnabled||!config.apiKey||process.env.TURAS_REPORT_TEST_MODE==='owned-fixture')throw new Error('Controlled live configuration is unavailable; fixture transport is not release evidence');
 const sourceDigest=await reportsSourceDigest();
 // Read-only domain verification must succeed before creating any dispatch intent.
 await verifyConfiguredReportSender();
 const selected=await reportTransaction(async db=>{
  const row=(await db.query('SELECT * FROM report_deliveries WHERE id=$1 AND environment_id=$2 FOR NO KEY UPDATE',[input.deliveryId,process.env.TURAS_ENVIRONMENT_ID])).rows[0];
  if(!row||row.payload_digest!==input.payloadDigest)throw new Error('Exact approved test delivery unavailable');
  const recipient=(await db.query('SELECT recipient_digest FROM report_policy_recipients WHERE policy_revision_id=$1 AND recipient_identity=$2 AND expires_at>now()',[row.policy_revision_id,row.recipient_identity])).rows[0];
  if(recipient?.recipient_digest!==input.recipientDigest)throw new Error('Exact approved test recipient unavailable');
  await requireReportDeliveryAuthority(db,row);
  const payload=(await db.query('SELECT request_bytes FROM report_delivery_payloads WHERE delivery_id=$1 AND expires_at>now()',[row.id])).rows[0];
  if(!payload)throw new Error('Exact approved test bytes unavailable');
  return {row,requestBytes:payload.request_bytes as Buffer};
 });
 await mkdir('local-artifacts/009',{recursive:true,mode:0o700});const directory=await mkdtemp(resolve('local-artifacts/009/live-delivery-'));
 let messageId=selected.row.provider_message_id as string|null;
 if(!messageId){
  if(selected.row.first_dispatch_at||selected.row.attempt_count!==0)throw new Error('Interrupted delivery requires reconciliation; this tool never resends');
  const [claim]=await reportTransaction(db=>claimReportDeliveries(db,1,{deliveryId:input.deliveryId,payloadDigest:input.payloadDigest,firstAttemptOnly:true}));
  if(!claim)throw new Error('Exact first dispatch unavailable; no replacement send permitted');
  const outcome=await dispatchReportDelivery(claim);
  await writeFile(join(directory,'dispatch.json'),JSON.stringify({sourceDigest,deliveryId:claim.id,payloadDigest:input.payloadDigest,state:outcome.state}),{mode:0o600,flag:'wx'});
  messageId=await reportTransaction(async db=>(await db.query('SELECT provider_message_id FROM report_deliveries WHERE id=$1',[claim.id])).rows[0].provider_message_id as string|null);
  if(!messageId)throw new Error('Provider identity unavailable; operator reconciliation required, never replacement send');
 }
 const proof=await retrieveReportMail({apiKey:config.apiKey,messageId,deliveryId:input.deliveryId,requestBytes:selected.requestBytes,payloadDigest:input.payloadDigest});
 await writeFile(join(directory,'provider-proof.json'),JSON.stringify({sourceDigest,...input,...proof,provider:'resend',transport:'live'}),{mode:0o600,flag:'wx'});
 if(proof.evidence!=='delivered')throw new Error('Provider acceptance is not delivery; rerun read-only evidence lookup later');
 if(sourceDigest!==await reportsSourceDigest())throw new Error('Release source changed');
 const evidence={gate:'reports-controlled-delivery',sourceDigest,deliveryId:input.deliveryId,payloadDigest:input.payloadDigest,recipientDigest:input.recipientDigest,provider:'resend',transport:'live',evidence:'delivered',status:'passed',hostedProof:false};
 await writeFile(join(directory,'completed.json'),JSON.stringify(evidence),{mode:0o600,flag:'wx'});
 console.log(JSON.stringify({gate:evidence.gate,sourceDigest,status:'passed',providerEvidence:'delivered',hostedProof:false}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(()=>{console.error('Controlled report delivery blocked; preserve the original identity and inspect private evidence. No replacement send is permitted.');process.exitCode=1;}).finally(closeRuntimePool);
