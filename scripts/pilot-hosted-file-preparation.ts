import {hostedRuntimeConnection} from './pilot-hosted-connection';
import {Client} from 'pg';
import {z} from 'zod';
import {exerciseHostedFileFault,hostedFileFaultCaseSchema} from './pilot-hosted-file-faults';
import {resolve,dirname,basename} from 'node:path';
import {pathToFileURL} from 'node:url';
import {pilotHostedScopeSchema} from '../lib/contracts/pilot-hosted';
import {hostedConfigurationSchema} from '../lib/server/operations/hosted-configuration';
import {withHostedCatalogCancellation} from '../lib/server/operations/recovery-cancellation';
import {readEvidence,createEvidenceDirectory,writeEvidence} from './pilot-evidence';
import {verifyHostedInfrastructureAuthorization} from './pilot-hosted-authorization';
import {runHostedReadChecks} from './pilot-hosted-http';
import {assertHostedFileTarget,prepareHostedMaximumFiles} from './pilot-hosted-maximum-files';
const privateJson=(path:string)=>readEvidence(dirname(resolve(path)),basename(path));
/** Explicit maximum-file preparation or one fixed admitted fault exercise.
 * Neither mode infers release approval or retries a paid operation. */
export async function pilotHostedFilePreparation(args=process.argv.slice(2)){
 const fault=args[0]==='--exercise-file-fault';
 if((fault?args.length!==13||args[9]!=='--case'||args[11]!=='--provider':args.length!==9||args[0]!=='--prepare-maximum-files')||args[1]!=='--scope'||args[3]!=='--configuration'||args[5]!=='--authorization'||args[7]!=='--output')throw Error('Exact private file preparation scope, configuration, authorization and output required');
 process.umask(0o077);process.env.VERCEL_BLOB_RETRIES='0';const scope=pilotHostedScopeSchema.parse(await privateJson(args[2])),configuration=hostedConfigurationSchema.parse(await privateJson(args[4])),rawAuthorization=await privateJson(args[6]),authorization=verifyHostedInfrastructureAuthorization(rawAuthorization,scope),root=resolve(args[8]);
 if(configuration.environmentMarker!==scope.environmentMarker||configuration.projectId!==scope.projectId||configuration.teamId!==scope.teamId||!configuration.dispatcherEnabled||configuration.maximumSandboxDispatches!==authorization.maximumSandboxJobs)throw Error('Exact enabled admitted file configuration required');
 const faultCase=fault?hostedFileFaultCaseSchema.parse(args[10]):undefined,provider=fault?z.strictObject({token:z.string().min(1),projectId:z.string().min(1),teamId:z.string().min(1)}).parse(await privateJson(args[12])):undefined;
 const raw=hostedRuntimeConnection(process.env.TURAS_PILOT_HOSTED_DATABASE_URL);await createEvidenceDirectory(root);
 return withHostedCatalogCancellation(Math.max(1,Math.min(1200000,Date.parse(authorization.expiresAt)-Date.now())),async parent=>{
  const lost=new AbortController(),signal=AbortSignal.any([parent,lost.signal]),db=new Client({connectionString:raw,connectionTimeoutMillis:5000,statement_timeout:5000,query_timeout:6000});db.on('error',error=>lost.abort(error));let prepared:Awaited<ReturnType<typeof prepareHostedMaximumFiles>>|Awaited<ReturnType<typeof exerciseHostedFileFault>>|undefined;
  try{await assertHostedFileTarget({scope,signal});await db.connect();await runHostedReadChecks(scope,db,signal,fetch,process.env,async actor=>{if(actor.role==='internal-admin'){const context={scope,db,headers:actor.headers,configuration,authorizationDigest:authorization.authorizationDigest,authorizationExpiresAt:authorization.expiresAt,authorization:rawAuthorization,evidenceDirectory:root,customerId:actor.partnerCustomerIds[0],signal};prepared=faultCase&&provider?await exerciseHostedFileFault({...context,case:faultCase,provider}):await prepareHostedMaximumFiles(context);}},configuration);if(!prepared)throw Error('Actual file exercise incomplete');if('case' in prepared)return prepared;await writeEvidence(root,'prepared.json',{scope,maximumOriginals:prepared.originals.length,originalBytes:prepared.originals.reduce((sum,row)=>sum+row.bytes,0),actualNormalUploadsAndProgramsVerified:true,deploymentRestartRequired:true,fullHostedFileCatalogVerified:false,modelCalls:0});console.info(JSON.stringify({maximumOriginalsPrepared:2,deploymentRestartRequired:true,fullHostedFileCatalogVerified:false,modelCalls:0}));return prepared;}
  catch(error){await writeEvidence(root,'failure.json',{scope,safeFailure:fault?'file_fault_incomplete':'maximum_files_incomplete',originalIntentsRetained:true,automaticPaidRetries:0,fullHostedFileCatalogVerified:false});throw error;}finally{await db.end();}
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)pilotHostedFilePreparation().catch(()=>{console.error('Hosted file preparation incomplete; inspect original intents without repeating uploads or jobs.');process.exitCode=1;});
