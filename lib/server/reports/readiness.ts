import type {PoolClient} from 'pg';
import {HttpFailure} from '../../contracts/http';
import {reportStoreRoot} from './store';
import {verifiedBundledBrand} from './brand';
import {reportConfig} from './config';
import {requireVerifiedReportSender} from './senders';
export async function requireReportEnvironment(db:PoolClient,write=false):Promise<void>{
 const row=(await db.query('SELECT environment_id,schema_version FROM turas_environment LIMIT 1')).rows[0];
 if(!row || row.environment_id!==process.env.TURAS_ENVIRONMENT_ID || row.schema_version<41)throw new HttpFailure(503,'report_schema_unavailable','Reports unavailable');
 if(write && !reportConfig().enabled)throw new HttpFailure(503,'feature_disabled','New reports are temporarily unavailable');
}
export async function reportReadiness(db:PoolClient,workspaceId:string){
 const codes:string[]=[];try{await requireReportEnvironment(db);}catch{codes.push('report_schema_unavailable');}
 const config=reportConfig();if(!config.enabled)codes.push('feature_disabled');
 try{await reportStoreRoot();}catch{codes.push('store_unavailable');}
 if(!config.rendererImage || !/^sha256:[a-f0-9]{64}$/.test(config.rendererImage))codes.push('renderer_unavailable');
 let currentBrand:Awaited<ReturnType<typeof verifiedBundledBrand>>|undefined;try{currentBrand=await verifiedBundledBrand();}catch{codes.push('font_unavailable');}
 if(codes.includes('report_schema_unavailable'))return {canPrepare:false,canSend:false,blockingCodes:codes};
 const brand=currentBrand?await db.query("SELECT 1 FROM report_brand_profiles WHERE environment_id=$1 AND workspace_id=$2 AND manifest_digest=$3 AND state='approved' LIMIT 1",[process.env.TURAS_ENVIRONMENT_ID,workspaceId,currentBrand.profileDigest]):{rowCount:0};
 if(!brand.rowCount)codes.push('brand_unapproved');
 try{if(!config.apiKey || !config.senderId)throw new Error();await requireVerifiedReportSender(db,workspaceId,config.senderId);}catch{codes.push('sender_unavailable');}
 const worker=await db.query("SELECT 1 FROM report_worker_heartbeats WHERE environment_id=$1 AND seen_at>now()-interval '45 seconds' LIMIT 1",[process.env.TURAS_ENVIRONMENT_ID]);
 if(!worker.rowCount)codes.push('worker_unavailable');
 return {canPrepare:!codes.some(code=>['report_schema_unavailable','feature_disabled','store_unavailable','worker_unavailable'].includes(code)),canSend:codes.length===0,blockingCodes:codes};
}
