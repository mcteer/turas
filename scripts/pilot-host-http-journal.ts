import {randomUUID} from 'node:crypto';
import {readdir,open,realpath} from 'node:fs/promises';
import {constants} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {z} from 'zod';
import {createEvidenceDirectory,readEvidence,writeEvidence} from './pilot-evidence';
import {recoveryDigest} from '../lib/contracts/pilot-recovery';
import {canonicalManagedHost} from '../lib/server/operations/managed-alias-inventory';
const digest=z.string().regex(/^[a-f0-9]{64}$/),phase=z.enum(['controls','first-census','final-census','diagnostic']);
const kind=z.string().regex(/^(?:protection-(?:negative|header|query|cookie-issue|cookie)|old-host-(?:ordinary|header|query|cookie-issue|cookie))$/);
export const pilotHostHttpPlanSchema=z.strictObject({contract:z.literal('pilot-host-http-journal-plan-v1'),id:z.uuid(),projectId:z.string().regex(/^prj_[A-Za-z0-9]+$/),teamId:z.string().regex(/^team_[A-Za-z0-9]+$/),sourceCommit:z.string().regex(/^[a-f0-9]{40}$/),maximumRequests:z.number().int().min(1).max(12000),maximumCostMicroUsd:z.number().int().positive().max(10000000),expiresAt:z.iso.datetime({offset:true}),authorityReference:z.string().min(1).max(256),previousJournalDigests:z.array(digest).max(100),historicalStrictFailureRetained:z.literal(true),unknownCostHoldsRetained:z.literal(true),automaticRetries:z.literal(false)});
const intentSchema=z.strictObject({contract:z.literal('pilot-host-http-intent-v1'),id:z.uuid(),ordinal:z.number().int().positive().max(12000),planDigest:digest,previousIntentDigest:digest.nullable(),phase,kind,host:z.string().min(1).max(253),at:z.iso.datetime({offset:true})});
const captureSchema=z.object({intentId:z.uuid(),host:z.string(),status:z.number().int().min(100).max(599),codeVersion:z.string().regex(/^[a-f0-9]{40}$/).nullable(),bodyDigest:digest,bodyBytes:z.number().int().min(0).max(65536),redirectObserved:z.boolean(),edgeDenied:z.boolean()});
const observationSchema=z.strictObject({contract:z.literal('pilot-host-http-observation-v1'),...captureSchema.shape,ordinal:z.number().int().positive().max(12000),phase,kind,intentDigest:digest,at:z.iso.datetime({offset:true})});
type Plan=z.infer<typeof pilotHostHttpPlanSchema>;type Intent=z.infer<typeof intentSchema>;type Observation=z.infer<typeof observationSchema>;
const name=(ordinal:number,suffix:'intent'|'response')=>'request-'+String(ordinal).padStart(5,'0')+'-'+suffix+'.json';
async function syncJournalDirectory(raw:string,privateRoot:boolean){
 const path=resolve(raw),directory=await open(path,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
 try{const stat=await directory.stat();if(!stat.isDirectory()||stat.uid!==process.getuid?.()||await realpath(path)!==path||(privateRoot?(stat.mode&0o777)!==0o700:(stat.mode&0o022)!==0))throw Error('Owned durable journal directory required');await directory.sync();}finally{await directory.close();}
}
/** Owner supplies already-authorized finite spending scope. This journal never
 * grants authority, settles unknown charges, renews a cap or dispatches HTTP.
 * One instance supplies all control/first/final phase hooks cumulatively. */
export class PilotHostHttpJournal{
 private queue:Promise<unknown>=Promise.resolve();private closed=false;private intents=new Map<string,Intent>();private observations=new Map<string,Observation>();private previousIntentDigest:string|null=null;
 private constructor(private root:string,readonly plan:Readonly<Plan>,private planDigest:string){}
 static async create(root:string,raw:unknown){
  const plan=pilotHostHttpPlanSchema.parse(raw),expires=Date.parse(plan.expiresAt);if(expires<=Date.now()||expires>Date.now()+172800000||new Set(plan.previousJournalDigests).size!==plan.previousJournalDigests.length)throw Error('Original finite authorized host journal plan required');
  await createEvidenceDirectory(root);await syncJournalDirectory(root,true);await syncJournalDirectory(dirname(resolve(root)),false);await writeEvidence(root,'plan.json',plan);await syncJournalDirectory(root,true);return new PilotHostHttpJournal(root,Object.freeze({...plan,previousJournalDigests:Object.freeze(plan.previousJournalDigests)}) as Readonly<Plan>,recoveryDigest(plan));
 }
 static async open(root:string){
  const plan=pilotHostHttpPlanSchema.parse(await readEvidence(root,'plan.json'));if(Date.parse(plan.expiresAt)>Date.now()+172800000||new Set(plan.previousJournalDigests).size!==plan.previousJournalDigests.length)throw Error('Original finite host journal plan required');const journal=new PilotHostHttpJournal(root,Object.freeze({...plan,previousJournalDigests:Object.freeze(plan.previousJournalDigests)}) as Readonly<Plan>,recoveryDigest(plan));
  const files=await readdir(root);if(files.length>1+2*plan.maximumRequests||files.some(file=>file!=='plan.json'&&!/^request-\d{5}-(?:intent|response)\.json$/.test(file)))throw Error('Complete bounded private host journal required');
  const intentFiles=files.filter(file=>file.endsWith('-intent.json')).sort();
  for(const file of intentFiles){
   const intent=intentSchema.parse(await readEvidence(root,file)),ordinal=journal.intents.size+1;
   if(file!==name(ordinal,'intent')||intent.ordinal!==ordinal||intent.planDigest!==journal.planDigest||intent.previousIntentDigest!==journal.previousIntentDigest||journal.intents.has(intent.id)||canonicalManagedHost(intent.host)!==intent.host||ordinal>plan.maximumRequests)throw Error('Host journal intent chain differs');
   journal.intents.set(intent.id,intent);journal.previousIntentDigest=recoveryDigest(intent);
  }
  for(const file of files.filter(file=>file.endsWith('-response.json'))){
   const observation=observationSchema.parse(await readEvidence(root,file)),intent=journal.intents.get(observation.intentId);
   if(!intent||file!==name(intent.ordinal,'response')||observation.ordinal!==intent.ordinal||observation.intentDigest!==recoveryDigest(intent)||observation.phase!==intent.phase||observation.kind!==intent.kind||observation.host!==intent.host||journal.observations.has(intent.id))throw Error('Host journal observation binding differs');journal.observations.set(intent.id,observation);
  }
  return journal;
 }
 private serialize<T>(run:()=>Promise<T>){const next=this.queue.then(run,run);this.queue=next.catch(()=>undefined);return next;}
 hooks(rawPhase:z.infer<typeof phase>){
  const selected=phase.parse(rawPhase);
  return {
   admit:(rawKind:string,rawHost:string)=>this.serialize(async()=>{
    if(this.closed||Date.parse(this.plan.expiresAt)<=Date.now()||this.intents.size>=this.plan.maximumRequests)throw Error('Original aggregate host HTTP admission closed');
    const host=canonicalManagedHost(rawHost);if(host!==rawHost)throw Error('Exact journal host required');
    const intent=intentSchema.parse({contract:'pilot-host-http-intent-v1',id:randomUUID(),ordinal:this.intents.size+1,planDigest:this.planDigest,previousIntentDigest:this.previousIntentDigest,phase:selected,kind:kind.parse(rawKind),host,at:new Date().toISOString()});
    try{await writeEvidence(this.root,name(intent.ordinal,'intent'),intent);this.intents.set(intent.id,intent);this.previousIntentDigest=recoveryDigest(intent);await syncJournalDirectory(this.root,true);}catch{this.closed=true;throw Error('Host intent write uncertain; reopen original journal before admission');}
    if(Date.parse(this.plan.expiresAt)<=Date.now()){this.closed=true;throw Error('Original authority expired after intent reservation; request remains consumed');}return intent.id;
   }),
   observe:(rawKind:string,raw:unknown)=>this.serialize(async()=>{
    const capture=captureSchema.parse(raw),intent=this.intents.get(capture.intentId);
    if(!intent||intent.phase!==selected||intent.kind!==rawKind||intent.host!==capture.host)throw Error('Exact admitted host observation required');
    const existing=this.observations.get(intent.id);if(existing){if(recoveryDigest(captureSchema.parse(existing))!==recoveryDigest(capture))throw Error('Immutable host observation differs');return;}
    const observation=observationSchema.parse({contract:'pilot-host-http-observation-v1',...capture,ordinal:intent.ordinal,phase:selected,kind:rawKind,intentDigest:recoveryDigest(intent),at:new Date().toISOString()});
    try{await writeEvidence(this.root,name(intent.ordinal,'response'),observation);await syncJournalDirectory(this.root,true);}catch{this.closed=true;throw Error('Host observation write uncertain; original intent remains consumed');}this.observations.set(intent.id,observation);
   }),
  };
 }
 status(){return Object.freeze({admissionClosed:this.closed||Date.parse(this.plan.expiresAt)<=Date.now()||this.intents.size>=this.plan.maximumRequests,reserved:this.intents.size,observed:this.observations.size,pending:this.intents.size-this.observations.size,remaining:this.plan.maximumRequests-this.intents.size,maximumRequests:this.plan.maximumRequests,maximumCostMicroUsd:this.plan.maximumCostMicroUsd,unknownCostHoldsRetained:true as const,authorityGranted:false as const,releaseApproved:false as const});}
}
