import {z} from 'zod';
import {resolve,dirname,basename} from 'node:path';
import {pilotHostedScopeSchema} from '../lib/contracts/pilot-hosted';
import {measureWorkMaintenanceHttpBatch} from '../lib/server/operations/work-maintenance-verification';
import {readEvidence,writeEvidence,createEvidenceDirectory} from './pilot-evidence';
import {withRecoveryCancellation} from '../lib/server/operations/recovery-cancellation';
const configurationSchema=z.strictObject({contract:z.literal('pilot-work-maintenance-http-configuration-v1'),sourceFile:z.string().min(1).max(4096),hostedScope:pilotHostedScopeSchema,scope:z.strictObject({environmentId:z.string().min(1).max(256),recoveryId:z.uuid(),controlRevision:z.number().int().positive()}),runtimeConnection:z.string().min(1).max(8192),expiresAt:z.iso.datetime({offset:true}),records:z.array(z.strictObject({kind:z.enum(['profile','artifact','report','workforce','gap','plan','execution']),recordId:z.uuid()})).min(1).max(8),password:z.string().min(1).max(4096),protectionBypass:z.string().min(1).max(8192).optional()});
/** A diagnostic batch only. Stored receipts cannot mint final recovery authority. */
export async function pilotWorkMaintenanceHttp(args:string[]){
 if(args.length!==5||args[0]!=='--measure-work-http')throw Error('Explicit private work HTTP measurement inputs required');
 const values:Record<string,string>={};
 for(let i=1;i<args.length;i+=2){const key=args[i].replace(/^--/,'');if(!args[i].startsWith('--')||!['configuration','output'].includes(key)||values[key]||!args[i+1]||args[i+1].startsWith('--'))throw Error('Invalid work HTTP measurement inputs');values[key]=args[i+1];}
 if(!values.configuration||!values.output)throw Error('Complete work HTTP measurement inputs required');
 const file=resolve(values.configuration),configuration=configurationSchema.parse(await readEvidence(dirname(file),basename(file))),deadline=Date.parse(configuration.expiresAt),remaining=deadline-Date.now();
 if(remaining<=0||remaining>300000)throw Error('Fresh finite work HTTP measurement required');
 const root=resolve(values.output);await createEvidenceDirectory(root);
 return withRecoveryCancellation(remaining,async signal=>{
  try{
   const result=await measureWorkMaintenanceHttpBatch({target:{sourceFile:resolve(configuration.sourceFile),hostedScope:configuration.hostedScope,scope:configuration.scope,runtimeConnection:configuration.runtimeConnection,deadline,signal},records:configuration.records,password:configuration.password,journalDirectory:root,protectionBypass:configuration.protectionBypass});
   await writeEvidence(root,'measured.json',result);console.info(JSON.stringify({maintenanceRecords:result.verifiedRecords,probeRetirementVerified:true,requiredScopeHealthy:false,restorationReady:false}));return result;
  }catch(error){await writeEvidence(root,'failure.json',{contract:'pilot-work-maintenance-http-failure-v1',safeFailure:'incomplete_work_http_measurement',requiredScopeHealthy:false,restorationReady:false});throw error;}
 });
}
