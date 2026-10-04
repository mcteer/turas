import {lstat,realpath,readFile,mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {resolve,join,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {z} from 'zod';
import {reportsSourceDigest} from './reports-source';
import {reportConfig} from '../lib/server/reports/config';
import {reportTransaction} from '../lib/server/reports/commands';
import {requireReportDeliveryAuthority} from '../lib/server/reports/outbox';
import {retrieveReportMail} from '../lib/server/reports/resend';
import {verifyConfiguredReportSender} from '../lib/server/reports/senders';
import {closeRuntimePool} from '../lib/server/db/client';
import {verifyReportSuiteCoverage} from './test-reports';
import {reportId,reportDigestSchema} from '../lib/server/reports/schema';
import {reportReadiness} from '../lib/server/reports/readiness';
import {REPORT_RECOVERY_SUITES} from './reports-recovery-check';
const recordSchema=z.object({gate:z.string(),sourceDigest:z.string().regex(/^[a-f0-9]{64}$/),status:z.literal('passed')}).passthrough();
export const REPORT_RELEASE_GATES=['reports-deterministic','reports-ui','reports-artifacts','reports-load','reports-recovery','reports-prior-feature-regressions','reports-controlled-delivery'] as const;
export function validateReportReleaseEvidence(raw:readonly unknown[],sourceDigest:string){
 const records=raw.map(value=>recordSchema.parse(value)),byGate=new Map<string,z.infer<typeof recordSchema>>();
 for(const record of records){
  if(record.sourceDigest!==sourceDigest||byGate.has(record.gate))throw new Error('Stale or duplicate release evidence');
  if(record.acceptanceComplete===false||(Array.isArray(record.pending)&&record.pending.length))throw new Error('Partial gate cannot certify release');
  byGate.set(record.gate,record);
 }
 const pending=REPORT_RELEASE_GATES.filter(gate=>!byGate.has(gate));
 const deterministic=byGate.get('reports-deterministic');if(deterministic&&(deterministic.suites!==verifyReportSuiteCoverage().length||deterministic.failed!==0||deterministic.skipped!==0||typeof deterministic.passed!=='number'||deterministic.passed<1))throw new Error('Incomplete deterministic gate');
 const ui=byGate.get('reports-ui');if(ui&&(!Array.isArray(ui.projects)||ui.projects.length!==4||new Set(ui.projects).size!==4||['webkit-desktop-light','webkit-desktop-dark','webkit-mobile-light','webkit-mobile-dark'].some(project=>!(ui.projects as unknown[]).includes(project))||ui.passed!==36))throw new Error('Incomplete WebKit gate');
 const artifacts=byGate.get('reports-artifacts');if(artifacts&&(artifacts.pairs!==6||typeof artifacts.rasters!=='number'||artifacts.rasters<12))throw new Error('Incomplete actual artifact gate');
 const load=byGate.get('reports-load');if(load&&(load.scopeOverflowDenied!==true||!Array.isArray(load.pending)||load.pending.length))throw new Error('Incomplete load boundary gate');
 if(load){
  z.object({shape:z.object({engagements:z.literal(1000),resources:z.literal(500),timeRevisions:z.literal(50000),deliveryRevisions:z.literal(20000),reportHistories:z.literal(5000),clients:z.literal(5),warmups:z.literal(10),samples:z.literal(100)}),
   measurements:z.object(Object.fromEntries(['list','detail','history','sources','policies','deliveries','acknowledgement'].map(name=>[name,z.object({samples:z.literal(100),p95Ms:z.number().finite().min(0).max(2000),maxMs:z.number().finite().min(0)})]))),
   preparations:z.object({count:z.literal(20),concurrency:z.literal(2),maxMs:z.number().finite().min(0).max(30000),quotaDenied:z.literal(true)}),
   renders:z.object({count:z.literal(12),concurrency:z.literal(2),maxMs:z.number().finite().min(0).max(120000),maxQueueMs:z.number().finite().min(0),image:z.string().regex(/^sha256:[a-f0-9]{64}$/),cpuPerJob:z.literal(2),memoryGiBPerJob:z.literal(2),network:z.literal('none')}),
   queue:z.object({limit:z.literal(100),rejected101:z.literal(true),fairCustomerCount:z.literal(2),deliveryLimit:z.literal(500),rejected501:z.literal(true)})}).parse(load);
 }
 const recovery=byGate.get('reports-recovery');if(recovery){
  const parsed=z.object({matchedSnapshot:z.literal(true),suites:z.array(z.object({suite:z.string(),passed:z.number().int().positive()})).length(REPORT_RECOVERY_SUITES.length),pending:z.array(z.never()).length(0),hostedProof:z.literal(false)}).parse(recovery);
  if(new Set(parsed.suites.map(item=>item.suite)).size!==REPORT_RECOVERY_SUITES.length||REPORT_RECOVERY_SUITES.some(suite=>!parsed.suites.some(item=>item.suite===suite)))throw new Error('Recovery manifest incomplete');
 }
 const live=byGate.get('reports-controlled-delivery');if(live&&(live.provider!=='resend'||live.transport!=='live'||live.evidence!=='delivered'||live.hostedProof!==false))throw new Error('Fixture or provider acceptance is not controlled delivery evidence');
 if(live)z.object({deliveryId:reportId,payloadDigest:reportDigestSchema,recipientDigest:reportDigestSchema}).parse(live);
 return {records,pending,byGate};
}
async function main(){
 const args=process.argv.slice(2);if(!args.length||args.length>10||args.some(arg=>!arg.startsWith('--evidence=')||arg.length<=11))throw new Error('Explicit private evidence files required');
 const root=await realpath(resolve('local-artifacts/009')),sourceDigest=await reportsSourceDigest(),records:unknown[]=[];
 for(const arg of args){
  const path=resolve(arg.slice(11)),canonical=await realpath(path),stat=await lstat(path);
  if(!canonical.startsWith(root+sep)||stat.isSymbolicLink()||!stat.isFile()||stat.mode&0o077||stat.size>1048576)throw new Error('Private source-bound evidence required');
  records.push(JSON.parse(await readFile(canonical,'utf8')));
 }
 const checked=validateReportReleaseEvidence(records,sourceDigest);
 if(checked.pending.length){console.log(JSON.stringify({gate:'reports-release',sourceDigest,status:'blocked',pending:checked.pending,hostedProof:false}));process.exitCode=1;return;}
 const config=reportConfig();if(!config.apiKey||process.env.TURAS_REPORT_TEST_MODE==='owned-fixture')throw new Error('Actual provider verification required');
 await verifyConfiguredReportSender();
 const live=checked.byGate.get('reports-controlled-delivery')!;
 const delivery=await reportTransaction(async db=>{
  const row=(await db.query('SELECT * FROM report_deliveries WHERE id=$1 AND environment_id=$2',[live.deliveryId,process.env.TURAS_ENVIRONMENT_ID])).rows[0];
  if(!row||row.payload_digest!==live.payloadDigest||!row.provider_message_id)throw new Error('Current exact provider identity required');
  if(!(await reportReadiness(db,row.workspace_id)).canSend)throw new Error('Current brand/store/font/sender/worker readiness required');
  await requireReportDeliveryAuthority(db,row);
  const recipient=(await db.query('SELECT recipient_digest FROM report_policy_recipients WHERE policy_revision_id=$1 AND recipient_identity=$2 AND expires_at>now()',[row.policy_revision_id,row.recipient_identity])).rows[0];
  if(recipient?.recipient_digest!==live.recipientDigest)throw new Error('Current exact test recipient required');
  const payload=(await db.query('SELECT request_bytes FROM report_delivery_payloads WHERE delivery_id=$1 AND expires_at>now()',[row.id])).rows[0];if(!payload)throw new Error('Exact approved release bytes required');
  return {deliveryId:row.id,messageId:row.provider_message_id,requestBytes:payload.request_bytes as Buffer,payloadDigest:row.payload_digest};
 });
 const provider=await retrieveReportMail({apiKey:config.apiKey,...delivery});if(provider.evidence!=='delivered')throw new Error('Current real provider delivery proof required');
 if(sourceDigest!==await reportsSourceDigest())throw new Error('Release source changed');
 await mkdir(root,{recursive:true,mode:0o700});const directory=await mkdtemp(join(root,'release-'));
 const evidence={gate:'reports-release',sourceDigest,gates:REPORT_RELEASE_GATES,status:'passed',hostedProof:false};
 await writeFile(join(directory,'completed.json'),JSON.stringify(evidence),{mode:0o600,flag:'wx'});console.log(JSON.stringify(evidence));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(()=>{console.error('Report release blocked: complete current private gates and real approval/provider configuration are required. No send or deployment was performed.');process.exitCode=1;}).finally(closeRuntimePool);
