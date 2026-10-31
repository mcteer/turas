import type {Client} from 'pg';
import {z} from 'zod';
import {recoveryDigest} from '../../contracts/pilot-recovery';
import {withLockedWorkRecoveryDecision,requireLockedWorkRecoveryConnection,isWorkRecoveryDecisionClient,type LockedWorkRecoveryInput,type LockedWorkRecoveryTarget} from './locked-work-recovery-target';
import {currentRecoveryStateDigest} from './recovery-state';
import {readManagedApprovedHostBindings} from './managed-approved-host-bindings';
import {readManagedHostPolicy,requireManagedHostAutomationKeys} from './managed-host-policy-provider';
import {readManagedProjectHostInventory} from './managed-project-host-inventory';
import {verifyManagedProtectionControls,measureManagedOldHostCensus,requireRepeatedManagedOldHostCensus} from './managed-protection-controls';
import {requirePilotHostHttpJournal,type PilotHostHttpJournal} from '../../../scripts/pilot-host-http-journal';
type Input={target:LockedWorkRecoveryInput;token:string;approvedHosts:readonly string[];journal:PilotHostHttpJournal};
type Census=Awaited<ReturnType<typeof measureManagedOldHostCensus>>;
const measured=new WeakMap<object,{token:string;approvedHosts:readonly string[];journal:PilotHostHttpJournal;environment:'preview'|'production';census:Census}>();
const scope=(target:LockedWorkRecoveryTarget)=>({environmentId:target.environmentId,recoveryId:target.recoveryId,controlRevision:target.controlRevision});
const targetDigest=(target:LockedWorkRecoveryTarget)=>{const {deadline,contract,...identity}=target;return recoveryDigest(identity);};
async function inspect(db:Client,target:LockedWorkRecoveryTarget,input:{token:string;approvedHosts:readonly string[];journal:PilotHostHttpJournal;environment:'preview'|'production'},signal:AbortSignal,previous?:Census){
 if(!isWorkRecoveryDecisionClient(db)||target.deadline<=Date.now())throw Error('Current genuine owner HTTP decision required');
 const bounded=AbortSignal.any([signal,AbortSignal.timeout(target.deadline-Date.now())]);bounded.throwIfAborted();
 await requireLockedWorkRecoveryConnection(db,target,scope(target));await requirePilotHostHttpJournal(input.journal,target);
 await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,16020))',[target.environmentId]);await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,16017))',[target.environmentId]);await currentRecoveryStateDigest(db);
 const hostScope={projectId:target.projectId,teamId:target.teamId,token:input.token,target:input.environment,deploymentId:target.deploymentId,sourceCommit:target.sourceCommit,approvedHosts:[...input.approvedHosts]};
 const metadata=async()=>({bindings:await readManagedApprovedHostBindings(hostScope,bounded),policy:await readManagedHostPolicy({projectId:target.projectId,teamId:target.teamId,token:input.token,approvedHosts:[...input.approvedHosts]},bounded),inventory:await readManagedProjectHostInventory({projectId:target.projectId,teamId:target.teamId,token:input.token,target:input.environment},bounded)});
 const initial=await metadata(),keys=requireManagedHostAutomationKeys(initial.policy),control=initial.bindings.rows.find(row=>row.deploymentId===target.deploymentId&&row.host===row.immutableHost&&row.host.endsWith('.vercel.app'));
 if(!control)throw Error('Selected immutable protected host must be explicitly approved');
 const oldHosts=initial.inventory.rows.filter(row=>!initial.policy.allowedHosts.includes(row.host)).length,required=5*keys.length+oldHosts*(1+4*keys.length),before=input.journal.status();
 if(before.admissionClosed||before.remaining<(previous?required:2*required))throw Error('Original cumulative journal cannot cover complete current HTTP phase');
 const controls=[];for(const secret of keys)controls.push(await verifyManagedProtectionControls({...input.journal.hooks('controls'),scope:hostScope,bindings:initial.bindings,host:control.host,secret,signal:bounded}));
 const census=await measureManagedOldHostCensus({...input.journal.hooks(previous?'final-census':'first-census'),scope:hostScope,...initial,controls,maximumRequests:input.journal.status().remaining,signal:bounded});
 // Actual reads begin after the final HTTP response. On final consumption a
 // distinct sequential complete census must also agree with the retained one.
 const current=await metadata();if(previous)requireRepeatedManagedOldHostCensus({scope:hostScope,...current,previous,current:census});
 else if(initial.bindings.bindingsDigest!==current.bindings.bindingsDigest||initial.policy.policyDigest!==current.policy.policyDigest||initial.policy.automationRegistryDigest!==current.policy.automationRegistryDigest||initial.inventory.inventoryDigest!==current.inventory.inventoryDigest)throw Error('Host platform state changed during initial census');
 await requirePilotHostHttpJournal(input.journal,target);bounded.throwIfAborted();const after=input.journal.status();
 if(after.reserved-before.reserved!==required||after.observed-before.observed!==required||after.pending!==before.pending)throw Error('Complete exact durable current HTTP phase required');
 return {census,journalId:input.journal.plan.id,journalPlanDigest:recoveryDigest(input.journal.plan),phaseRequests:required,cumulativeRequests:after.reserved,remainingRequests:after.remaining,hostInventoryDigest:current.inventory.inventoryDigest,policyDigest:current.policy.policyDigest,bindingsDigest:current.bindings.bindingsDigest,automationRegistryDigest:current.policy.automationRegistryDigest};
}
/** Real target component only. Initial complete census remains insufficient
 * until repeated inside the final genuine owner decision. No unlock/INSERT. */
export async function measureWorkOldHttpAdmission(input:Input){
 const token=z.string().min(1).max(8192).parse(input.token),approvedHosts=Object.freeze(z.array(z.string()).min(1).max(16).parse(input.approvedHosts)),environment=input.target.hostedScope.target;
 const result=await withLockedWorkRecoveryDecision(input.target,async(db,target)=>({targetDigest:targetDigest(target),...await inspect(db,target,{token,approvedHosts,journal:input.journal,environment},input.target.signal)}));
 const {census,...summary}=result,proof=Object.freeze({contract:'pilot-work-old-http-admission-measurement-v1' as const,...summary,censusDigest:census.censusDigest,oldHosts:census.oldHosts,completedAt:new Date().toISOString(),initialCurrentHttpCensusMeasured:true as const,repeatedCurrentHttpAdmissionVerified:false as const,cronAdmissionClosed:false as const,workflowClosureVerified:false as const,restorationReady:false as const});
 measured.set(proof,{token,approvedHosts,journal:input.journal,environment,census});return proof;
}
export async function requireMeasuredWorkOldHttpAdmission(db:Client,target:LockedWorkRecoveryTarget,proof:Awaited<ReturnType<typeof measureWorkOldHttpAdmission>>,signal:AbortSignal){
 const actual=measured.get(proof),age=Date.now()-Date.parse(proof.completedAt);
 if(!actual||!isWorkRecoveryDecisionClient(db)||proof.targetDigest!==targetDigest(target)||!Number.isFinite(age)||age<0||age>300000)throw Error('Genuine fresh exact work HTTP admission measurement required');
 const current=await inspect(db,target,actual,signal,actual.census);
 return Object.freeze({contract:'pilot-work-old-http-admission-verification-v1' as const,targetDigest:proof.targetDigest,...scope(target),censusDigest:current.census.censusDigest,requestCaptureDigest:current.census.requestCaptureDigest,journalId:current.journalId,journalPlanDigest:current.journalPlanDigest,cumulativeRequests:current.cumulativeRequests,oldHosts:current.census.oldHosts,repeatedCurrentHttpAdmissionVerified:true as const,cronAdmissionClosed:false as const,workflowClosureVerified:false as const,requiredScopeHealthy:false as const,restorationReady:false as const});
}
