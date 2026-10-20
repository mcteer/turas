import {basename,dirname,resolve,join} from 'node:path';
import {mkdtemp,rm} from 'node:fs/promises';
import {z} from 'zod';
import {pilotHostedScopeSchema} from '../lib/contracts/pilot-hosted';
import {workCaptureCandidateSchema} from '../lib/contracts/pilot-capture';
import {readEvidence,writeEvidence,createEvidenceDirectory} from './pilot-evidence';
import {readRetainedWorkDenialSnapshot} from './pilot-denial-reader';
import {PilotHostHttpJournal} from './pilot-host-http-journal';
import {withRecoveryCancellation} from '../lib/server/operations/recovery-cancellation';
import {withLockedWorkRecoveryDecision,type LockedWorkRecoveryInput} from '../lib/server/operations/locked-work-recovery-target';
import {measureWorkTargetIntegrity} from '../lib/server/operations/work-target-integrity';
import {produceWorkRecoveryVerification,resumeCommittedWorkRecoveryVerification} from '../lib/server/operations/work-recovery-verification';
import {quarantineRestoredAuthority} from '../lib/server/operations/recovery-quarantine';
import {Client} from 'pg';
import {databaseSafetyCaptureSourceSchema} from './pilot-database-safety-copy';
import {deriveWorkMcpScopeInTransaction,measureWorkMcpCategoryWindow,type WorkMcpCategoryMeasurement} from '../lib/server/operations/work-mcp-verification';
import {deriveWorkMaintenanceInventoryInTransaction} from '../lib/server/operations/owned-maintenance-inventory';
import {measureWorkMaintenanceHttpBatch,type WorkMaintenanceHttpBatch} from '../lib/server/operations/work-maintenance-verification';
import {deriveWorkConversationInventory,measureWorkConversationHttpBatch,type WorkConversationHttpBatch} from '../lib/server/operations/work-conversation-http';
import {measureWorkCronAdmission} from '../lib/server/operations/work-cron-admission';
import {measureWorkOldHttpAdmission} from '../lib/server/operations/work-old-http-admission';
import {measureWorkManagedTerminalInventory} from '../lib/server/operations/work-managed-terminal-inventory';
import {measureWorkSandboxTerminalInventory} from '../lib/server/operations/work-sandbox-terminal-inventory';
import {measureWorkLegacyProductionPool} from '../lib/server/operations/work-legacy-production-pool';
const file=z.string().min(1).max(4096),configSchema=z.strictObject({contract:z.literal('pilot-work-recovery-verification-input-v1'),sourceFile:file,hostedScope:pilotHostedScopeSchema,scope:z.strictObject({environmentId:z.string().min(1).max(256),recoveryId:z.uuid(),controlRevision:z.number().int().positive()}),runtimeFile:file,credentialsFile:file,candidateFile:file,bundle:file,keyFile:file,assetRoot:file,storeId:z.string().min(1).max(128),denialReceipt:file,denialDestination:file,backupCapturedAt:z.iso.datetime({offset:true}),hostJournalDirectory:file,approvedHosts:z.array(z.string().min(1).max(253)).min(1).max(256),productionSourceFile:file.optional(),output:file}).refine(value=>value.hostedScope.target!=='preview'||!!value.productionSourceFile,'Preview verification requires explicit distinct Production source');
const credentialsSchema=z.strictObject({token:z.string().min(1).max(16384),cronSecret:z.string().min(1).max(8192),protectionBypass:z.string().min(1).max(8192),oidcToken:z.string().min(1).max(16384),passwords:z.strictObject({mcteer:z.string().min(1).max(4096),panel:z.string().min(1).max(4096),partner:z.string().min(1).max(4096)})});
const privateJson=(path:string)=>readEvidence(dirname(resolve(path)),basename(path));
/** All measurements are produced here from actual fixed transports. Configuration
 * contains paths/identity/finite original journal, never healthy proof flags.
 * This records verification only; resolution/opening remain separate commands. */
export async function pilotWorkRecoveryVerify(args:string[]){
 if(args.length!==3||args[0]!=='--verify-work-recovery'||args[1]!=='--configuration')throw Error('Explicit private work verification configuration required');
 const config=configSchema.parse(await privateJson(args[2])),credentials=credentialsSchema.parse(await privateJson(config.credentialsFile)),runtime=z.strictObject({connection:z.string().min(1).max(16384)}).parse(await privateJson(config.runtimeFile)),candidate=workCaptureCandidateSchema.parse(await privateJson(config.candidateFile));
 const root=resolve(config.output);await createEvidenceDirectory(root);
 return withRecoveryCancellation(900000,async signal=>{
  const target=():LockedWorkRecoveryInput=>({sourceFile:resolve(config.sourceFile),hostedScope:config.hostedScope,scope:config.scope,runtimeConnection:runtime.connection,signal,deadline:Date.now()+290000});
  const material=()=>({target:target(),candidate,bundle:resolve(config.bundle),keyFile:resolve(config.keyFile),assetRoot:resolve(config.assetRoot),storeId:config.storeId,oidcToken:credentials.oidcToken});
  let staging:string|undefined;
  try{
   // This must precede physical baseline measurement, quarantine and all probes.
   const resumed=await resumeCommittedWorkRecoveryVerification(target(),material());if(resumed){await writeEvidence(root,'verification.json',resumed);console.info(JSON.stringify(resumed));return resumed;}
   const integrity=await measureWorkTargetIntegrity(material());
   staging=await mkdtemp(join(root,'private-denials-'));
   const retained=await readRetainedWorkDenialSnapshot({receipt:resolve(config.denialReceipt),destination:resolve(config.denialDestination),staging,environmentId:config.scope.environmentId,after:config.backupCapturedAt},signal);
   const source=databaseSafetyCaptureSourceSchema.parse(await privateJson(config.sourceFile)),owner=new Client({connectionString:source.databaseUrl,connectionTimeoutMillis:5000});
   // The genuine target has already verified exact owner/platform/runtime. The
   // quarantine entry point independently rechecks owner, marker and revision.
   try{await owner.connect();await quarantineRestoredAuthority(owner,config.scope,retained);}finally{await owner.end();}
   const mcpScope=await withLockedWorkRecoveryDecision(target(),(db,current)=>deriveWorkMcpScopeInTransaction(db,current)),mcp:WorkMcpCategoryMeasurement[]=[];
   const identity=(value:typeof mcpScope.required[number])=>JSON.stringify([value.workspaceId,value.username,value.category,value.customerId]);
   const pending=[...mcpScope.required];while(pending.length){signal.throwIfAborted();const first=pending[0],selections=pending.filter(value=>value.workspaceId===first.workspaceId&&value.username===first.username).slice(0,32),requested=new Set(selections.map(identity));
    const completed=await measureWorkMcpCategoryWindow({target:target(),selections,password:credentials.passwords[first.username],retained,journalDirectory:root,protectionBypass:credentials.protectionBypass});
    if(!completed.length)throw Error('Work MCP window made no progress');const seen=new Set<string>();
    for(const proof of completed){const key=identity(proof.selection);if(!requested.has(key)||seen.has(key))throw Error('Work MCP window returned a foreign or duplicate selection');seen.add(key);const index=pending.findIndex(value=>identity(value)===key);if(index<0)throw Error('Work MCP window selection is no longer pending');pending.splice(index,1);}
    mcp.push(...completed);
   }
   const inventory=await withLockedWorkRecoveryDecision(target(),async(db,current)=>({maintenance:(await deriveWorkMaintenanceInventoryInTransaction(db,current,signal)).records.map(({kind,recordId})=>({kind,recordId})),conversations:(await deriveWorkConversationInventory(db,current)).records.map(row=>row.id)})),maintenance:WorkMaintenanceHttpBatch[]=[],conversations:WorkConversationHttpBatch[]=[];
   for(let offset=0;offset<inventory.maintenance.length;offset+=8)maintenance.push(await measureWorkMaintenanceHttpBatch({target:target(),records:inventory.maintenance.slice(offset,offset+8),password:credentials.passwords.mcteer,journalDirectory:root,protectionBypass:credentials.protectionBypass}));
   for(let offset=0;offset<inventory.conversations.length;offset+=8)conversations.push(await measureWorkConversationHttpBatch({target:target(),recordIds:inventory.conversations.slice(offset,offset+8),passwords:credentials.passwords,journalDirectory:root,protectionBypass:credentials.protectionBypass}));
   const journal=await PilotHostHttpJournal.open(resolve(config.hostJournalDirectory)),common={target:target(),token:credentials.token},effects={cron:await measureWorkCronAdmission({...common,cronSecret:credentials.cronSecret,protectionBypass:credentials.protectionBypass}),oldHttp:await measureWorkOldHttpAdmission({...common,approvedHosts:config.approvedHosts,journal}),native:await measureWorkManagedTerminalInventory({...common,retained}),sandbox:await measureWorkSandboxTerminalInventory({...common,retained}),...(config.hostedScope.target==='preview'?{legacyProductionPeer:await measureWorkLegacyProductionPool({...common,productionSourceFile:resolve(config.productionSourceFile??''),journalDirectory:root})}:{})};
   const result=await produceWorkRecoveryVerification({target:target(),integrity,integrityMaterial:material(),retained,service:{maintenance,mcp,conversations},effects,passwords:credentials.passwords,journalDirectory:root});await writeEvidence(root,'verification.json',result);console.info(JSON.stringify(result));return result;
  }catch(error){await writeEvidence(root,'failure.json',{contract:'pilot-work-recovery-verification-failure-v1',...config.scope,safeFailure:'verification_incomplete',serviceOpened:false,restorationReady:false});throw error;}
  finally{if(staging)await rm(staging,{recursive:true,force:true});}
 });
}
