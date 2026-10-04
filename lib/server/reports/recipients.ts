import {createHash,createHmac,randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {z} from 'zod';
import {HttpFailure} from '../../contracts/http';
import {reportConfig} from './config';
import {getServerConfig} from '../config';
import {reportSelectionSchema,reportId} from './schema';
export function normalizeReportAddress(raw:string){
 if(raw.length>254 || raw!==raw.trim() || /[\s\x00-\x1f\x7f<>(),;:"\\]/.test(raw))throw new HttpFailure(422,'recipient_invalid','Use one valid email address');
 const parts=raw.split('@');if(parts.length!==2 || !/^[A-Za-z0-9.!#$%&'*+\/=?^_`{|}~-]{1,64}$/.test(parts[0]) || parts[0].startsWith('.') || parts[0].endsWith('.') || parts[0].includes('..') || !/^[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,63}$/.test(parts[1]) || parts[1].split('.').some(label=>label.length>63 || label.startsWith('-') || label.endsWith('-') || !label))throw new HttpFailure(422,'recipient_invalid','Use one valid email address');
 return parts[0]+'@'+parts[1].toLowerCase();
}
export const reportRecipientSchema=z.strictObject({address:z.string().min(3).max(254).refine(value=>{try{normalizeReportAddress(value);return true;}catch{return false;}}),membershipId:reportId.optional(),entitlementRationale:z.string().trim().min(1).max(500).optional()}).refine(value=>Boolean(value.membershipId)!==Boolean(value.entitlementRationale));
export const reportRecipientPolicySchema=z.strictObject({selection:reportSelectionSchema,senderId:reportId,recipients:z.array(reportRecipientSchema).min(1).max(20)}).refine(value=>new Set(value.recipients.map(recipient=>normalizeReportAddress(recipient.address))).size===value.recipients.length);
function recipientKeys(){
 const config=reportConfig();try{
  const keys=z.record(z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/),z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/)).parse(JSON.parse(config.recipientKeys??''));
  if(!config.activeKeyId || !keys[config.activeKeyId] || Object.keys(keys).length>10 || Object.values(keys).some(key=>Buffer.from(key,'base64').length<32))throw new Error();
  return {keys,activeKeyId:config.activeKeyId};
 }catch{throw new HttpFailure(503,'sender_unavailable','Private recipient identity is not configured');}
}
export async function reportRecipientIdentity(db:PoolClient,workspaceId:string,address:string){
 const normalized=normalizeReportAddress(address),{keys,activeKeyId}=recipientKeys(),environment=process.env.TURAS_ENVIRONMENT_ID!;
 // Removing a live identity key or reusing its name with different bytes cannot create a new recipient identity.
 if((await db.query('SELECT 1 FROM report_recipient_identities WHERE environment_id=$1 AND workspace_id=$2 AND NOT(hmac_key_id=ANY($3::text[])) LIMIT 1',[environment,workspaceId,Object.keys(keys)])).rowCount)throw new HttpFailure(503,'sender_unavailable','Retained recipient identity keys are required');
 for(const [keyId,key]of Object.entries(keys)){
  const fingerprint=createHash('sha256').update('reports-recipient-key-v1:').update(Buffer.from(key,'base64')).digest('hex');
  await db.query('INSERT INTO report_recipient_keys(environment_id,hmac_key_id,key_digest) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[environment,keyId,fingerprint]);
  if((await db.query('SELECT key_digest FROM report_recipient_keys WHERE environment_id=$1 AND hmac_key_id=$2',[environment,keyId])).rows[0]?.key_digest!==fingerprint)throw new HttpFailure(503,'sender_unavailable','Recipient key identity changed');
 }
 // A separate stable, purpose-scoped lock avoids two identities during key rotation.
 const lock=createHmac('sha256',getServerConfig().TURAS_MAINTENANCE_SECRET).update('reports-recipient-lock-v1:').update(environment).update(':').update(normalized).digest('hex');
 await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`report-recipient:${workspaceId}:${lock}`]);
 const digests=Object.entries(keys).map(([keyId,key])=>({keyId,digest:createHmac('sha256',Buffer.from(key,'base64')).update('reports-recipient-v1:').update(environment).update(':').update(normalized).digest('hex')}));
 const found=(await db.query(`SELECT id,recipient_digest,hmac_key_id FROM report_recipient_identities WHERE environment_id=$1 AND workspace_id=$2 AND (hmac_key_id,recipient_digest) IN (SELECT * FROM unnest($3::text[],$4::text[])) ORDER BY created_at,id`,[environment,workspaceId,digests.map(value=>value.keyId),digests.map(value=>value.digest)])).rows;
 if(found.length>1)throw new HttpFailure(409,'policy_changed','Recipient identity requires reconciliation');
 if(found[0])return {id:found[0].id,recipientDigest:found[0].recipient_digest,keyId:found[0].hmac_key_id,address:normalized};
 const active=digests.find(value=>value.keyId===activeKeyId)!,id=randomUUID();
 await db.query('INSERT INTO report_recipient_identities(id,environment_id,workspace_id,recipient_digest,hmac_key_id) VALUES($1,$2,$3,$4,$5)',[id,environment,workspaceId,active.digest,active.keyId]);
 return {id,recipientDigest:active.digest,keyId:active.keyId,address:normalized};
}
export async function verifyPolicyRecipientAuthority(db:PoolClient,workspaceId:string,audience:string,recipients:Array<{membership_id?:string|null;membershipId?:string;entitlement_rationale?:string|null;entitlementRationale?:string}>){
 for(const recipient of recipients){const membership=recipient.membershipId??recipient.membership_id,rationale=recipient.entitlementRationale??recipient.entitlement_rationale;
  if(audience==='delivery'){if(!rationale || membership)throw new HttpFailure(422,'recipient_invalid','Delivery recipient entitlement is required');}
  else{
   if(!membership || rationale || !(await db.query(`SELECT 1 FROM memberships m JOIN principals p ON p.id=m.principal_id AND p.active WHERE m.id=$1 AND m.workspace_id=$2 AND m.active AND m.kind='internal' FOR SHARE OF m,p`,[membership,workspaceId])).rowCount)throw new HttpFailure(422,'recipient_invalid','An active internal recipient membership is required');
  }
 }
}
