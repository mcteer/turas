import {createHash} from 'node:crypto';
import {Resend,type Response as ResendResponse} from 'resend';
import {z} from 'zod';
import {HttpFailure} from '../../contracts/http';
import {canonicalReportJson} from '../../reports/canonical';
import {normalizeReportAddress} from './recipients';
import {reportId} from './schema';

export type ReportProviderFetch=(url:string,options:RequestInit)=>Promise<Response>;
export type ReportProviderOutcome=
 |{kind:'provider_accepted';messageId:string}
 |{kind:'retryable_failure';code:'provider_rate_limit';retryAfterSeconds:number}
 |{kind:'permanent_failure';code:'provider_rejected'|'provider_payload_conflict'}
 |{kind:'uncertain';code:'provider_outcome_unknown'};
const address=z.string().refine(value=>{try{return normalizeReportAddress(value)===value;}catch{return false;}});
const domainProof=z.object({id:reportId,name:z.string().max(253),status:z.literal('verified'),capabilities:z.object({sending:z.literal('enabled')}),open_tracking:z.literal(false),click_tracking:z.literal(false)});
const frozenSchema=z.strictObject({from:address,to:z.tuple([address]),subject:z.string().min(1).max(200).regex(/^[^\r\n\x00-\x1f\x7f]+$/),
 html:z.string().min(1).refine(value=>Buffer.byteLength(value)<=262144),text:z.string().min(1).refine(value=>Buffer.byteLength(value)<=262144),
 tags:z.array(z.strictObject({name:z.literal('turas_delivery'),value:reportId})).max(1),
 attachments:z.array(z.strictObject({filename:z.enum(['executive-report.pdf','executive-report.pptx']),content_type:z.enum(['application/pdf','application/vnd.openxmlformats-officedocument.presentationml.presentation']),content:z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/)})).max(2)});
export function freezeReportMail(input:{from:string;to:string;subject:string;html:string;text:string;attachments:Array<{format:'pdf'|'pptx';bytes:Buffer}>;deliveryId?:string}){
 if(new Set(input.attachments.map(item=>item.format)).size!==input.attachments.length || input.attachments.some(item=>item.bytes.length===0 || item.bytes.length>10485760) || input.attachments.reduce((sum,item)=>sum+item.bytes.length,0)>15728640)throw new HttpFailure(422,'artifact_limit','Mail attachment limits exceeded');
 const request=frozenSchema.parse({from:normalizeReportAddress(input.from),to:[normalizeReportAddress(input.to)],subject:input.subject,html:input.html,text:input.text,
  tags:input.deliveryId?[{name:'turas_delivery',value:reportId.parse(input.deliveryId)}]:[],attachments:input.attachments.map(item=>({filename:`executive-report.${item.format}`,content_type:item.format==='pdf'?'application/pdf':'application/vnd.openxmlformats-officedocument.presentationml.presentation',content:item.bytes.toString('base64')}))});
 const bytes=Buffer.from(canonicalReportJson(request));if(bytes.length>23068672)throw new HttpFailure(422,'artifact_limit','Encoded mail exceeds its limit');
 return {bytes,digest:createHash('sha256').update(bytes).digest('hex')};
}
/** The pinned SDK serializes requests; this override avoids its raw-error logger and hidden endpoint overrides. */
const retrievedSchema=z.object({id:reportId,from:address,to:z.tuple([address]),subject:z.string().max(200),html:z.string().nullable(),text:z.string().nullable(),tags:z.array(z.strictObject({name:z.literal('turas_delivery'),value:reportId})).length(1),last_event:z.enum(['bounced','canceled','clicked','complained','delivered','delivery_delayed','failed','opened','queued','scheduled','sent','suppressed']),cc:z.array(address).max(0).nullable().optional(),bcc:z.array(address).max(0).nullable().optional(),reply_to:z.array(address).max(0).nullable().optional()});
class PrivateReportResend extends Resend {
 constructor(apiKey:string,private readonly providerFetch:ReportProviderFetch){super(apiKey,{baseUrl:'https://api.resend.com'});}
 override async fetchRequest<T>(path:string,options:RequestInit={}):Promise<ResendResponse<T>>{
  const domainLookup=options.method==='GET' && /^\/domains\/[a-f0-9-]{36}$/.test(path),emailLookup=options.method==='GET' && /^\/emails\/[a-f0-9-]{36}$/.test(path);
  if(!domainLookup && !emailLookup && (path!=='/emails' || options.method!=='POST'))throw new Error('Report provider operation is not permitted');
  try{
   const response=await this.providerFetch(`https://api.resend.com${path}`,{...options,redirect:'error',signal:AbortSignal.timeout(15000)});
   // Only bounded fields survive the boundary. Never log the provider's body or headers.
   const headers:Record<string,string>={};const retry=response.headers.get('Retry-After');if(retry && /^[0-9]{1,12}$/.test(retry))headers['retry-after']=String(Math.min(3600,Math.max(1,Number(retry))));
   let length=0,body='';const reader=response.body?.getReader();
   if(reader){const chunks:Uint8Array[]=[];try{for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>(emailLookup?1048576:16384))throw new Error('Provider response exceeds its limit');chunks.push(value);}body=Buffer.concat(chunks).toString('utf8');}finally{await reader.cancel().catch(()=>{});}}
   let parsed:unknown;try{parsed=JSON.parse(body);}catch{parsed=null;}
   if(response.ok){const result=(domainLookup?domainProof:emailLookup?retrievedSchema:z.strictObject({id:reportId})).safeParse(parsed);if(!result.success)throw new Error('Provider acknowledgement unavailable');return {data:result.data as T,error:null,headers};}
   const name=typeof parsed==='object' && parsed!==null && 'name' in parsed?parsed.name:null;
   return {data:null,error:{name:name==='invalid_idempotent_request'?'invalid_idempotent_request':'application_error',message:'Provider request unavailable',statusCode:response.status},headers};
  }catch{return {data:null,error:{name:'application_error',message:'Provider outcome unavailable',statusCode:null},headers:null};}
 }
}
export async function verifyReportSenderDomain(input:{apiKey:string;domainId:string;senderAddress:string},providerFetch:ReportProviderFetch=(url,options)=>fetch(url,options)){
 if(!input.apiKey || !reportId.safeParse(input.domainId).success)throw new HttpFailure(503,'sender_unavailable','Report sender verification is unavailable');
 const sender=normalizeReportAddress(input.senderAddress),result=await new PrivateReportResend(input.apiKey,providerFetch).domains.get(input.domainId);
 if(!result.data || result.data.id!==input.domainId || result.data.name.toLowerCase()!==sender.split('@')[1])throw new HttpFailure(503,'sender_unavailable','A verified sender with tracking disabled is required');
 return {domainId:input.domainId,domain:result.data.name.toLowerCase(),openTracking:false,clickTracking:false};
}
/** The caller must have durably committed dispatch intent and current eligibility before calling. */
export async function sendReportMail(input:{apiKey:string;providerKey:string;requestBytes:Buffer;payloadDigest:string},providerFetch:ReportProviderFetch=(url,options)=>fetch(url,options)):Promise<ReportProviderOutcome>{
 if(!input.apiKey || !reportId.safeParse(input.providerKey).success || input.requestBytes.length>23068672 || createHash('sha256').update(input.requestBytes).digest('hex')!==input.payloadDigest)throw new HttpFailure(409,'payload_changed','Frozen delivery content is unavailable');
 let request:z.infer<typeof frozenSchema>;try{request=frozenSchema.parse(JSON.parse(input.requestBytes.toString('utf8')));if(canonicalReportJson(request)!==input.requestBytes.toString('utf8'))throw new Error();}catch{throw new HttpFailure(409,'payload_changed','Frozen delivery content is unavailable');}
 const formats=new Set<string>();let total=0;
 for(const attachment of request.attachments){const bytes=Buffer.from(attachment.content,'base64'),pdf=attachment.filename.endsWith('.pdf');
  if(formats.has(attachment.filename) || bytes.length<1 || bytes.length>10485760 || bytes.toString('base64')!==attachment.content || attachment.content_type!==(pdf?'application/pdf':'application/vnd.openxmlformats-officedocument.presentationml.presentation'))throw new HttpFailure(409,'payload_changed','Frozen delivery attachment is unavailable');
  formats.add(attachment.filename);total+=bytes.length;
 }if(total>15728640)throw new HttpFailure(409,'payload_changed','Frozen delivery attachments exceed their limit');
 const result=await new PrivateReportResend(input.apiKey,providerFetch).post<{id:string}>('/emails',JSON.parse(canonicalReportJson(request)),{idempotencyKey:input.providerKey});
 if(result.data)return {kind:'provider_accepted',messageId:result.data.id};
 if(result.error.name==='invalid_idempotent_request')return {kind:'permanent_failure',code:'provider_payload_conflict'};
 if(result.error.statusCode===429)return {kind:'retryable_failure',code:'provider_rate_limit',retryAfterSeconds:Number(result.headers?.['retry-after']??60)};
 if(result.error.statusCode!==null && result.error.statusCode>=400 && result.error.statusCode<500 && result.error.statusCode!==409 && result.error.statusCode!==408)return {kind:'permanent_failure',code:'provider_rejected'};
 return {kind:'uncertain',code:'provider_outcome_unknown'};
}

/** Read-only lookup proves the opaque delivery tag and original content, never recipient inference. */
export async function retrieveReportMail(input:{apiKey:string;messageId:string;deliveryId:string;requestBytes:Buffer;payloadDigest:string},providerFetch:ReportProviderFetch=(url,options)=>fetch(url,options)){
 if(!reportId.safeParse(input.messageId).success || !reportId.safeParse(input.deliveryId).success || createHash('sha256').update(input.requestBytes).digest('hex')!==input.payloadDigest)throw new HttpFailure(409,'provider_evidence_mismatch','Provider evidence is unavailable');
 const frozen=frozenSchema.parse(JSON.parse(input.requestBytes.toString('utf8')));
 const response=await new PrivateReportResend(input.apiKey,providerFetch).emails.get(input.messageId),parsed=retrievedSchema.safeParse(response.data);
 if(!parsed.success)throw new HttpFailure(409,'provider_evidence_mismatch','Provider evidence is unavailable');const data=parsed.data;
 if(data.id!==input.messageId || data.tags[0].value!==input.deliveryId || frozen.tags[0]?.value!==input.deliveryId || data.from!==frozen.from || data.to[0]!==frozen.to[0] || data.subject!==frozen.subject || data.html!==frozen.html || data.text!==frozen.text)throw new HttpFailure(409,'provider_evidence_mismatch','Provider evidence does not match this exact delivery');
 const evidence=data.last_event==='delivered'?'delivered':data.last_event==='bounced'?'bounced':data.last_event==='complained'?'complained':['failed','canceled','suppressed'].includes(data.last_event)?'failed':'accepted';
 return {messageId:input.messageId,evidence:evidence as 'delivered'|'bounced'|'complained'|'failed'|'accepted'};
}
