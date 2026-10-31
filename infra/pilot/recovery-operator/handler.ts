import {reviewedManualBackupSchema} from '../../../lib/server/operations/work-backup-manual';
import {workBackupFailureDiagnostic} from '../../../lib/server/operations/work-backup-diagnostics';
import type {IncomingMessage,ServerResponse} from 'node:http';
import {timingSafeEqual,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {workBackupConfigurationSchema,runScheduledWorkBackup,runReviewedWorkBackup,workBackupPrivateObjects} from '../../../lib/server/operations/work-backup-run';

/** Only the independent operator Function is built. No Eve conversation/model
 * transport, customer-supplied body or source application's cookies are exposed. */
export default async function backup(request:IncomingMessage,response:ServerResponse){
 response.setHeader('Cache-Control','no-store');response.setHeader('Content-Type','application/json');
 const reply=(status:number,value:unknown)=>{response.statusCode=status;response.end(JSON.stringify(value));};
 if(request.url!=='/api/backup'){reply(404,{error:'not_found'});return;}
 if(request.method!=='GET'){reply(405,{error:'method_not_allowed'});return;}
 const secret=process.env.CRON_SECRET,authorization=request.headers.authorization;
 const authorized=()=>{
  if(!secret||!/^[A-Za-z0-9_-]{43,128}$/.test(secret)||typeof authorization!=='string'||authorization.length!==secret.length+7)return false;
  const actual=Buffer.from(authorization),expected=Buffer.from('Bearer '+secret);
  return actual.byteLength===expected.byteLength&&timingSafeEqual(actual,expected);
 };
 if(!authorized()){reply(401,{error:'unauthorized'});return;}
 if(process.env.TURAS_WORK_BACKUP_ENABLED!=='1'){reply(503,{error:'backup_disabled',restorationReady:false});return;}
 let master:Buffer|undefined;
 try{
  if(process.env.VERCEL!=='1'||process.env.VERCEL_ENV!=='production'||process.platform!=='linux'||process.arch!=='x64'||Number(process.versions.node.split('.')[0])!==24)throw Error('Production operator runtime required');
  const raw=process.env.TURAS_WORK_BACKUP_CONFIG;if(!raw||raw.length>16384)throw Error('Explicit operator configuration required');
  const config=workBackupConfigurationSchema.parse(JSON.parse(raw));
  // The pinned Blob SDK defaults to retrying control-plane operations. This
  // dedicated operator admits one bounded attempt, including list requests.
  process.env.VERCEL_BLOB_RETRIES='0';
  if(process.env.VERCEL_PROJECT_ID!==config.operatorProjectId||!/^TURAS_RECOVERY_MASTER_[A-Z0-9_]{1,100}$/.test(config.keyReference))throw Error('Exact independent operator project and key required');
  const value=process.env[config.keyReference];if(!value||!/^[a-f0-9]{64}$/.test(value))throw Error('Separate operator key unavailable');master=Buffer.from(value,'hex');
  const metadata=JSON.parse(await readFile(join(__dirname,'source.json'),'utf8'));
  if(createHash('sha256').update(await readFile(__filename)).digest('hex')!==metadata.runtimeDigest)throw Error('Operator runtime bytes differ');
  const input={configuration:config,source:metadata.source,assetRoot:join(__dirname,'native-client'),objects:workBackupPrivateObjects(config.environmentId,config.storeId,config.maximumObjects,config.maximumObjectBytes,config.contract),key:{master,reference:config.keyReference,version:config.keyVersion},signal:AbortSignal.timeout(280000)};
  const manualId=request.headers['x-turas-reviewed-capture'];let result;
  if(manualId!==undefined){const rawReview=process.env.TURAS_WORK_BACKUP_MANUAL_REVIEW;if(typeof manualId!=='string'||!rawReview||rawReview.length>8192)throw Error('Explicit protected manual review required');const manualReview=reviewedManualBackupSchema.parse(JSON.parse(rawReview));if(manualId!==manualReview.id)throw Error('Exact reviewed manual capture required');result=await runReviewedWorkBackup({...input,manualReview});}
  else result=await runScheduledWorkBackup(input);
  console.info(JSON.stringify({event:'work-backup.complete',...result}));
  reply(200,{state:'captured',...(result.invocationKind?{invocationKind:result.invocationKind,reviewedManualCaptureId:result.reviewedManualCaptureId,originalScheduledSlotSucceeded:false}:{}),coldDownloadAuthenticated:result.coldDownloadAuthenticated,restorationReady:false});
 }catch(error){
  console.error(JSON.stringify({event:'work-backup.failed',...workBackupFailureDiagnostic(error),restorationReady:false}));reply(503,{error:'backup_incomplete',restorationReady:false});
 }finally{master?.fill(0);}
}
