import {measureWorkMcpCanonicalScope} from '../lib/server/operations/work-mcp-branch-verification';
import {pilotDenialSnapshot,requireOriginalWorkDenialCapture,requireOriginalWorkDenialSource} from './pilot-denial-snapshot';
import {beginRetainedWorkDenialHistory,advanceRetainedWorkDenialHistory} from './pilot-retained-denial-history';
import {basename,dirname,resolve,join} from 'node:path';
import {mkdtemp,rm} from 'node:fs/promises';
import {z} from 'zod';
import {pilotHostedScopeSchema} from '../lib/contracts/pilot-hosted';
import {workCaptureCandidateSchema} from '../lib/contracts/pilot-capture';
import {readEvidence,writeEvidence,createEvidenceDirectory} from './pilot-evidence';
import {readRetainedWorkDenialSnapshot,readHistoricalWorkDenialSnapshot} from './pilot-denial-reader';
import {PilotHostHttpJournal} from './pilot-host-http-journal';
import {withRecoveryCancellation} from '../lib/server/operations/recovery-cancellation';
import {withLockedWorkRecoveryDecision,type LockedWorkRecoveryInput} from '../lib/server/operations/locked-work-recovery-target';
import {measureWorkTargetIntegrity} from '../lib/server/operations/work-target-integrity';
import {produceWorkRecoveryVerification,resumeCommittedWorkRecoveryVerification} from '../lib/server/operations/work-recovery-verification';
import {quarantineLockedWorkAuthority} from '../lib/server/operations/recovery-quarantine';
import {databaseSafetyCaptureSourceSchema} from './pilot-database-safety-copy';
import {measureWorkMcpCategoryWindow,refreshMeasuredWorkMcpDenials,type WorkMcpCategoryMeasurement} from '../lib/server/operations/work-mcp-verification';
import {deriveWorkMaintenanceInventoryInTransaction} from '../lib/server/operations/owned-maintenance-inventory';
import {measureWorkMaintenanceHttpBatch,type WorkMaintenanceHttpBatch} from '../lib/server/operations/work-maintenance-verification';
import {deriveWorkConversationInventory,measureWorkConversationHttpBatch,type WorkConversationHttpBatch} from '../lib/server/operations/work-conversation-http';
import {measureWorkCronAdmission} from '../lib/server/operations/work-cron-admission';
import {measureWorkOldHttpAdmission} from '../lib/server/operations/work-old-http-admission';
import {measureWorkManagedTerminalInventory} from '../lib/server/operations/work-managed-terminal-inventory';
import {measureWorkSandboxTerminalInventory} from '../lib/server/operations/work-sandbox-terminal-inventory';
import {measureWorkLegacyProductionPool} from '../lib/server/operations/work-legacy-production-pool';
const file=z.string().min(1).max(4096),configSchema=z.strictObject({contract:z.enum(['pilot-work-recovery-verification-input-v2','pilot-work-recovery-verification-input-v3']),sourceFile:file,hostedScope:pilotHostedScopeSchema,scope:z.strictObject({environmentId:z.string().min(1).max(256),recoveryId:z.uuid(),controlRevision:z.number().int().positive()}),runtimeFile:file,credentialsFile:file,candidateFile:file,bundle:file,keyFile:file,assetRoot:file,storeId:z.string().min(1).max(128),denialReceipt:file,denialDestination:file,denialSourceFile:file,backupCapturedAt:z.iso.datetime({offset:true}),hostJournalDirectory:file,approvedHosts:z.array(z.string().min(1).max(253)).min(1).max(256),productionSourceFile:file.optional(),output:file}).refine(value=>value.hostedScope.target!=='preview'||!!value.productionSourceFile,'Preview verification requires explicit distinct Production source');
const credentialsSchema=z.strictObject({token:z.string().min(1).max(16384),cronSecret:z.string().min(1).max(8192),protectionBypass:z.string().min(1).max(8192),oidcToken:z.string().min(1).max(16384).optional(),blobToken:z.string().min(1).max(8192).optional(),passwords:z.strictObject({mcteer:z.string().min(1).max(4096),panel:z.string().min(1).max(4096),partner:z.string().min(1).max(4096)})});
const privateJson=(path:string)=>readEvidence(dirname(resolve(path)),basename(path));
/** All measurements are produced here from actual fixed transports. Configuration
 * contains paths/identity/finite original journal, never healthy proof flags.
 * This records verification only; resolution/opening remain separate commands. */
export async function pilotWorkRecoveryVerify(args:string[]){
 if(args.length!==3||args[0]!=='--verify-work-recovery'||args[1]!=='--configuration')throw Error('Explicit private work verification configuration required');
 const config=configSchema.parse(await privateJson(args[2])),credentials=credentialsSchema.parse(await privateJson(config.credentialsFile)),runtime=z.strictObject({connection:z.string().min(1).max(16384)}).parse(await privateJson(config.runtimeFile)),candidate=workCaptureCandidateSchema.parse(await privateJson(config.candidateFile));
 if((credentials.oidcToken!==undefined)===(credentials.blobToken!==undefined)||config.contract==='pilot-work-recovery-verification-input-v2'&&!credentials.oidcToken)throw Error('Explicit versioned private Blob credential required');
 const root=resolve(config.output);await createEvidenceDirectory(root);
 const commandDeadline=Date.now()+900000;
 return withRecoveryCancellation(900000,async signal=>{
  const target=():LockedWorkRecoveryInput=>({sourceFile:resolve(config.sourceFile),hostedScope:config.hostedScope,scope:config.scope,runtimeConnection:runtime.connection,signal,deadline:Math.min(Date.now()+290000,commandDeadline)});
  const material=()=>({target:target(),candidate,bundle:resolve(config.bundle),keyFile:resolve(config.keyFile),assetRoot:resolve(config.assetRoot),storeId:config.storeId,...(credentials.blobToken?{blobToken:credentials.blobToken}:{oidcToken:credentials.oidcToken!})});
  let staging:string|undefined;
  try{
   // This must precede physical baseline measurement, quarantine and all probes.
   const resumed=await resumeCommittedWorkRecoveryVerification(target(),material());if(resumed){await writeEvidence(root,'verification.json',resumed);console.info(JSON.stringify(resumed));return resumed;}
   const integrity=await measureWorkTargetIntegrity(material());
   staging=await mkdtemp(join(root,'private-denials-'));
   const baseline=await readHistoricalWorkDenialSnapshot({receipt:resolve(config.denialReceipt),destination:resolve(config.denialDestination),staging,environmentId:config.scope.environmentId,after:config.backupCapturedAt},signal);
   const source=databaseSafetyCaptureSourceSchema.parse(await privateJson(config.sourceFile)),original=databaseSafetyCaptureSourceSchema.parse(await privateJson(config.denialSourceFile));
   requireOriginalWorkDenialSource(original,source);
   let captures=0;
   const capture=async()=>{
    signal.throwIfAborted();if(++captures>8)throw Error('Original finite denial capture allowance exhausted');
    const output=join(root,'current-denials-'+captures);
    const receipt=await pilotDenialSnapshot(['--capture-work-denials','--source',resolve(config.denialSourceFile),'--destination',resolve(config.denialDestination),'--output',output],signal);
    const cold=await mkdtemp(join(root,'private-denials-'));
    try{const current=await readRetainedWorkDenialSnapshot({receipt:join(output,'snapshot.json'),destination:resolve(config.denialDestination),staging:cold,environmentId:config.scope.environmentId,after:config.backupCapturedAt},signal);requireOriginalWorkDenialCapture(receipt,original,source,current);return current;}
    finally{await rm(cold,{recursive:true,force:true});}
   };
   let retained=await capture(),denialHistory=beginRetainedWorkDenialHistory(baseline,retained);
   await quarantineLockedWorkAuthority(target(),retained);
   const canonicalMcp=await measureWorkMcpCanonicalScope({target:target(),passwords:credentials.passwords,retained,journalDirectory:root}),mcpScope={required:canonicalMcp.representatives},mcp:WorkMcpCategoryMeasurement[]=[];
   const identity=(value:typeof mcpScope.required[number])=>JSON.stringify([value.workspaceId,value.username,value.category,value.customerId]);
   const refresh=async(force=false)=>{
    if(!force&&Date.now()-Date.parse(retained.snapshot.capturedAt)<120000)return;
    const current=await capture();denialHistory=advanceRetainedWorkDenialHistory(denialHistory,current);
    if(mcp.length)refreshMeasuredWorkMcpDenials(mcp,current);retained=current;
   };
   const mcpTarget=()=>{const current=target();return {...current,deadline:Math.min(current.deadline,Date.parse(retained.snapshot.capturedAt)+299000)};};
   const pending=[...mcpScope.required];while(pending.length){signal.throwIfAborted();await refresh();const first=pending[0],selections=pending.filter(value=>value.workspaceId===first.workspaceId&&value.username===first.username).slice(0,32),requested=new Set(selections.map(identity));
    const completed=await measureWorkMcpCategoryWindow({target:mcpTarget(),selections,password:credentials.passwords[first.username],retained,journalDirectory:root,protectionBypass:credentials.protectionBypass});
    if(!completed.length)throw Error('Work MCP window made no progress');const seen=new Set<string>();
    for(const proof of completed){const key=identity(proof.selection);if(!requested.has(key)||seen.has(key))throw Error('Work MCP window returned a foreign or duplicate selection');seen.add(key);const index=pending.findIndex(value=>identity(value)===key);if(index<0)throw Error('Work MCP window selection is no longer pending');pending.splice(index,1);}
    mcp.push(...completed);await refresh();
   }
   const inventory=await withLockedWorkRecoveryDecision(target(),async(db,current)=>({maintenance:(await deriveWorkMaintenanceInventoryInTransaction(db,current,signal)).records.map(({kind,recordId})=>({kind,recordId})),conversations:(await deriveWorkConversationInventory(db,current)).records.map(row=>row.id)})),maintenance:WorkMaintenanceHttpBatch[]=[],conversations:WorkConversationHttpBatch[]=[];
   for(let offset=0;offset<inventory.maintenance.length;offset+=8)maintenance.push(await measureWorkMaintenanceHttpBatch({target:target(),records:inventory.maintenance.slice(offset,offset+8),password:credentials.passwords.mcteer,journalDirectory:root,protectionBypass:credentials.protectionBypass}));
   for(let offset=0;offset<inventory.conversations.length;offset+=8)conversations.push(await measureWorkConversationHttpBatch({target:target(),recordIds:inventory.conversations.slice(offset,offset+8),passwords:credentials.passwords,journalDirectory:root,protectionBypass:credentials.protectionBypass}));
   // Every participant/category gets a recent actual hosted canary. These are
   // explicit finite reads, not retries of an unknown or paid side effect.
   const canaries=new Map<string,typeof mcpScope.required[number]>();
   for(const selected of mcpScope.required)canaries.set(JSON.stringify([selected.workspaceId,selected.username,selected.category]),selected);
   const pendingCanaries=[...canaries.values()];
   while(pendingCanaries.length){
    await refresh();const first=pendingCanaries[0],selections=pendingCanaries.filter(s=>s.workspaceId===first.workspaceId&&s.username===first.username).slice(0,32);
    const completed=await measureWorkMcpCategoryWindow({target:mcpTarget(),selections,password:credentials.passwords[first.username],retained,journalDirectory:root,protectionBypass:credentials.protectionBypass});
    if(!completed.length)throw Error('Recent hosted canary window made no progress');
    const requested=new Set(selections.map(identity)),seen=new Set<string>();
    for(const proof of completed){const key=identity(proof.selection),index=mcp.findIndex(old=>identity(old.selection)===key),pending=pendingCanaries.findIndex(s=>identity(s)===key);if(!requested.has(key)||seen.has(key)||index<0||pending<0)throw Error('Foreign or duplicate hosted canary');seen.add(key);mcp[index]=proof;pendingCanaries.splice(pending,1);}
   }
   await refresh(true);
   const journal=await PilotHostHttpJournal.open(resolve(config.hostJournalDirectory)),common={target:target(),token:credentials.token},effects={cron:await measureWorkCronAdmission({...common,cronSecret:credentials.cronSecret,protectionBypass:credentials.protectionBypass}),oldHttp:await measureWorkOldHttpAdmission({...common,approvedHosts:config.approvedHosts,journal}),native:await measureWorkManagedTerminalInventory({...common,retained}),sandbox:await measureWorkSandboxTerminalInventory({...common,retained}),...(config.hostedScope.target==='preview'?{legacyProductionPeer:await measureWorkLegacyProductionPool({...common,productionSourceFile:resolve(config.productionSourceFile??''),journalDirectory:root})}:{})};
   const result=await produceWorkRecoveryVerification({target:target(),integrity,integrityMaterial:material(),retained,denialHistory,service:{maintenance,mcp,canonicalMcp,conversations},effects,passwords:credentials.passwords,journalDirectory:root});await writeEvidence(root,'verification.json',result);console.info(JSON.stringify(result));return result;
  }catch(error){await writeEvidence(root,'failure.json',{contract:'pilot-work-recovery-verification-failure-v1',...config.scope,safeFailure:'verification_incomplete',serviceOpened:false,restorationReady:false});throw error;}
  finally{if(staging)await rm(staging,{recursive:true,force:true});}
 });
}
