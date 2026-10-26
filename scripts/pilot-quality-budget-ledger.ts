import {constants} from 'node:fs';
import {lstat,mkdir,open,readdir,realpath,rmdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {hostedLearningDispatchSchema} from '../lib/contracts/pilot-hosted-learning';
import {createEvidenceDirectory,readEvidence,writeEvidence,evidenceDigest} from './pilot-evidence';

const digest=z.string().regex(/^[a-f0-9]{64}$/),micro=z.number().int().nonnegative().safe();
const authorization=z.strictObject({contract:z.literal('pilot-quality-budget-v1'),id:z.uuid(),capMicroUsd:micro.positive(),contextCreditCap:z.number().int().min(0).max(4).optional(),authorizationDigest:digest,sourceDigest:digest,catalogDigest:digest,modelId:z.literal('spacexai/grok-4.7'),expiresAt:z.iso.datetime({offset:true})});
/** A separately approved continuation extends time only. No cap, charge,
 * reservation, model or original authorization can be replaced by this input. */
export const qualityContinuationSchema=z.strictObject({
 contract:z.literal('pilot-quality-continuation-v1'),id:z.uuid(),budgetId:z.uuid(),ledgerRoot:z.string().min(1).max(4096),
 originalAuthorizationDigest:digest,previousAuthorityDigest:digest,journalHeadDigest:digest,
 sourceCommit:z.string().regex(/^[a-f0-9]{40}$/),sourceDigest:digest,catalogDigest:digest,
 userInstructionReference:z.string().trim().min(1).max(512),
 recordedAt:z.iso.datetime({offset:true}),expiresAt:z.iso.datetime({offset:true}),
}).superRefine((value,ctx)=>{const duration=Date.parse(value.expiresAt)-Date.parse(value.recordedAt);if(duration<=0||duration>86400000)ctx.addIssue({code:'custom',message:'Finite continuation of at most 24 hours required'});});
/** Manual operator review preserves original uncertainty and reserves its full
 * worst case. Additional allowance is explicit, additive, and never automatic. */
export const qualityResumptionSchema=z.strictObject({
 contract:z.literal('pilot-quality-reviewed-resumption-v1'),id:z.uuid(),budgetId:z.uuid(),ledgerRoot:z.string().min(1).max(4096),
 originalAuthorizationDigest:digest,previousAuthorityDigest:digest,journalHeadDigest:digest,
 sourceCommit:z.string().regex(/^[a-f0-9]{40}$/),sourceDigest:digest,catalogDigest:digest,
 unknownDispatches:z.array(z.strictObject({id:z.uuid(),dispatchDigest:digest,unknownDigest:digest,permanentHoldMicroUsd:micro.positive()})).max(1000),
 additionalAllowanceMicroUsd:micro.max(25000000),taskAdmissionDigest:digest,independentReviewDigest:digest,
 userInstructionReference:z.string().trim().min(1).max(512),recordedAt:z.iso.datetime({offset:true}),
 uncertainRequestsMayRetry:z.literal(false),unknownChargeSettled:z.literal(false),automaticTopUp:z.literal(false),
}).superRefine((value,ctx)=>{
 if(value.unknownDispatches.length===0&&value.additionalAllowanceMicroUsd!==0)
  ctx.addIssue({code:'custom',path:['additionalAllowanceMicroUsd'],message:'A source-only review cannot add allowance'});
});
const event=z.discriminatedUnion('kind',[
 z.strictObject({kind:z.literal('reviewed-resumption'),id:z.uuid(),ordinal:z.number().int().positive(),previousDigest:digest,approval:qualityResumptionSchema,observedAt:z.iso.datetime({offset:true})}),
 z.strictObject({kind:z.literal('unknown-exposure'),id:z.uuid(),ordinal:z.number().int().positive(),previousDigest:digest,observedChargeMicroUsd:micro,providerProofDigest:digest,observedAt:z.iso.datetime({offset:true})}),
 z.strictObject({kind:z.literal('continuation'),id:z.uuid(),ordinal:z.number().int().positive(),previousDigest:digest,approval:qualityContinuationSchema,observedAt:z.iso.datetime({offset:true})}),
 z.strictObject({kind:z.literal('attempt'),id:z.uuid(),ordinal:z.number().int().positive(),previousDigest:digest,sourceCommit:z.string().regex(/^[a-f0-9]{40}$/),sourceDigest:digest,catalogDigest:digest,observedAt:z.iso.datetime({offset:true})}),
 z.strictObject({kind:z.literal('dispatch'),id:z.uuid(),ordinal:z.number().int().positive(),previousDigest:digest,modelId:z.enum(['spacexai/grok-4.7','openai/text-embedding-3-small']),ceilingMicroUsd:micro.positive(),pricingDigest:digest,hostedLearning:hostedLearningDispatchSchema.optional(),observedAt:z.iso.datetime({offset:true})}),
 z.strictObject({kind:z.literal('settlement'),id:z.uuid(),ordinal:z.number().int().positive(),previousDigest:digest,chargedMicroUsd:micro,inputTokens:micro,outputTokens:micro,generationId:z.string().min(1).max(256),observedAt:z.iso.datetime({offset:true})}),
 z.strictObject({kind:z.literal('unknown'),id:z.uuid(),ordinal:z.number().int().positive(),previousDigest:digest,reason:z.enum(['provider_error','incomplete_stream','invalid_accounting','overrun','aborted']),observedChargeMicroUsd:micro.optional(),observedAt:z.iso.datetime({offset:true})}),
 z.strictObject({kind:z.literal('credit-dispatch'),id:z.uuid(),ordinal:z.number().int().positive(),previousDigest:digest,ceilingCredits:z.literal(1),accountProofDigest:digest,observedAt:z.iso.datetime({offset:true})}),
 z.strictObject({kind:z.literal('credit-settlement'),id:z.uuid(),ordinal:z.number().int().positive(),previousDigest:digest,creditsConsumed:z.number().int().min(0).max(1),requestId:z.string().min(1).max(256),accountProofDigest:digest,observedAt:z.iso.datetime({offset:true})}),
 z.strictObject({kind:z.literal('credit-unknown'),id:z.uuid(),ordinal:z.number().int().positive(),previousDigest:digest,observedCreditsConsumed:micro.optional(),observedAt:z.iso.datetime({offset:true})}),
]);
type Event=z.infer<typeof event>;

/** Evaluation-only shared accounting outside disposable application copies.
 * An uncertain dispatch blocks admission until an explicit independent operator
 * review preserves its full exposure. No stale-lock stealing, uncertain retry,
 * automatic allowance, release, or inferred provider settlement exists here. */
export class QualityBudgetLedger{
 constructor(readonly root:string){}
 static async create(root:string,input:z.infer<typeof authorization>){
  const parsed=authorization.parse(input);if(Date.parse(parsed.expiresAt)<=Date.now())throw Error('Fresh evaluation authorization required');
  await createEvidenceDirectory(resolve(root));await writeEvidence(resolve(root),'authorization.json',parsed);return new QualityBudgetLedger(resolve(root));
 }
 private async lock<T>(run:()=>Promise<T>):Promise<T>{
  const root=resolve(this.root),info=await lstat(root);
  if(!info.isDirectory()||info.isSymbolicLink()||(info.mode&511)!==448||info.uid!==process.getuid?.()||await realpath(root)!==root)throw Error('Unsafe shared evaluation ledger');
  const lock=join(root,'lock'),until=Date.now()+3000;for(;;){try{await mkdir(lock,{mode:448});break;}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST'||Date.now()>=until)throw Error('Evaluation accounting lock unavailable');await new Promise(r=>setTimeout(r,50));}}
  try{return await run();}finally{await rmdir(lock);}
 }
 private async read(){
  const authority=authorization.parse(await readEvidence(this.root,'authorization.json'));
  const names=(await readdir(this.root)).filter(n=>n!=='authorization.json'&&n!=='lock').sort();
  if(names.length>10000||names.some(n=>!/^event-[0-9]{6}\.json$/.test(n)))throw Error('Unexpected shared evaluation ledger content');
  let previousDigest=evidenceDigest(JSON.stringify(authority)),chargedMicroUsd=0,contextCreditsConsumed=0;
  let additionalAllowanceMicroUsd=0,reviewedSource:z.infer<typeof qualityResumptionSchema>|undefined;const permanentHolds=new Map<string,number>(),unknownEvents=new Map<string,Extract<Event,{kind:'unknown'}>>();
  let effectiveAuthority=authority,continuation:z.infer<typeof qualityContinuationSchema>|undefined;
  let currentSource:{sourceCommit?:string;sourceDigest:string;catalogDigest:string;attemptId?:string}={sourceDigest:authority.sourceDigest,catalogDigest:authority.catalogDigest};
  const dispatches=new Map<string,Extract<Event,{kind:'dispatch'}>>(),observedUnknownCharges=new Map<string,number>(),observedUnknownCredits=new Map<string,number>(),creditDispatches=new Set<string>(),creditSettled=new Set<string>(),creditUnknown=new Set<string>(),settled=new Set<string>(),unknown=new Set<string>(),generationIds=new Set<string>();
  const isDisposed=(id:string)=>unknown.has(id)&&permanentHolds.get(id)===Math.max(dispatches.get(id)!.ceilingMicroUsd,observedUnknownCharges.get(id)??0);
  for(const [index,name] of names.entries()){
   if(name!==`event-${String(index+1).padStart(6,'0')}.json`)throw Error('Incomplete shared evaluation journal');
   const entry=event.parse(await readEvidence(this.root,name));if(entry.ordinal!==index+1||entry.previousDigest!==previousDigest)throw Error('Shared evaluation journal identity differs');
   if(entry.kind==='continuation'){
    const approval=entry.approval,recorded=Date.parse(approval.recordedAt),observed=Date.parse(entry.observedAt);
    if(approval.id!==entry.id||approval.ledgerRoot!==resolve(this.root)||approval.budgetId!==authority.id||approval.originalAuthorizationDigest!==authority.authorizationDigest||approval.previousAuthorityDigest!==effectiveAuthority.authorizationDigest||approval.journalHeadDigest!==previousDigest||recorded<Date.parse(effectiveAuthority.expiresAt)||recorded>observed||observed>=Date.parse(approval.expiresAt)||[...dispatches.keys()].some(id=>!settled.has(id)&&!isDisposed(id))||[...creditDispatches].some(id=>!creditSettled.has(id)))throw Error('Exact unencumbered original-budget continuation required');
    continuation=approval;effectiveAuthority={...effectiveAuthority,authorizationDigest:evidenceDigest(JSON.stringify(approval)),expiresAt:approval.expiresAt};
    currentSource={sourceCommit:approval.sourceCommit,sourceDigest:approval.sourceDigest,catalogDigest:approval.catalogDigest};reviewedSource=undefined;
   }
   else if(entry.kind==='reviewed-resumption'){
    const a=entry.approval,ids=a.unknownDispatches.map(d=>d.id),expected=[...unknown].sort();
    if(entry.id!==a.id||a.budgetId!==authority.id||a.ledgerRoot!==resolve(this.root)||a.originalAuthorizationDigest!==authority.authorizationDigest||a.previousAuthorityDigest!==effectiveAuthority.authorizationDigest||a.journalHeadDigest!==previousDigest||Date.parse(a.recordedAt)>Date.parse(entry.observedAt)||Date.parse(entry.observedAt)>=Date.parse(effectiveAuthority.expiresAt)||JSON.stringify([...ids].sort())!==JSON.stringify(expected)||new Set(ids).size!==ids.length||[...dispatches.keys()].some(id=>!settled.has(id)&&!unknown.has(id))||[...creditDispatches].some(id=>!creditSettled.has(id)))throw Error('Exact reviewed original-journal resumption required');
    for(const proof of a.unknownDispatches){const d=dispatches.get(proof.id),u=unknownEvents.get(proof.id);if(!d||!u||proof.dispatchDigest!==evidenceDigest(JSON.stringify(d))||proof.unknownDigest!==evidenceDigest(JSON.stringify(u))||proof.permanentHoldMicroUsd!==Math.max(d.ceilingMicroUsd,observedUnknownCharges.get(proof.id)??0)||Date.parse(a.recordedAt)<Date.parse(u.observedAt))throw Error('Permanent original uncertainty hold differs');permanentHolds.set(proof.id,proof.permanentHoldMicroUsd);}
    additionalAllowanceMicroUsd+=a.additionalAllowanceMicroUsd;const cap=authority.capMicroUsd+additionalAllowanceMicroUsd;if(!Number.isSafeInteger(cap)||cap>100000000||chargedMicroUsd+[...permanentHolds.values()].reduce((n,v)=>n+v,0)>cap)throw Error('Explicit additive allowance is insufficient');
    effectiveAuthority={...effectiveAuthority,capMicroUsd:cap,authorizationDigest:evidenceDigest(JSON.stringify(a))};reviewedSource=a;currentSource={sourceCommit:a.sourceCommit,sourceDigest:a.sourceDigest,catalogDigest:a.catalogDigest};
   }
   else if(entry.kind==='unknown-exposure'){if(!unknown.has(entry.id)||(observedUnknownCharges.get(entry.id)??0)>entry.observedChargeMicroUsd)throw Error('Original unknown exposure cannot decrease');observedUnknownCharges.set(entry.id,entry.observedChargeMicroUsd);}
   else if(entry.kind==='attempt'){if([...dispatches.keys()].some(id=>!settled.has(id)&&!isDisposed(id))||[...creditDispatches].some(id=>!creditSettled.has(id)))throw Error('An unresolved provider prevents a fresh attempt');if((reviewedSource??continuation)&&['sourceCommit','sourceDigest','catalogDigest'].some(key=>entry[key as 'sourceCommit'|'sourceDigest'|'catalogDigest']!==(reviewedSource??continuation)![key as 'sourceCommit'|'sourceDigest'|'catalogDigest']))throw Error('Continuation source differs');currentSource={sourceCommit:entry.sourceCommit,sourceDigest:entry.sourceDigest,catalogDigest:entry.catalogDigest,attemptId:entry.id};}
   else if(entry.kind.startsWith('credit-')){
    if(entry.kind==='credit-dispatch'){if(creditDispatches.has(entry.id)||[...dispatches.keys()].some(id=>!settled.has(id)&&!isDisposed(id))||[...creditDispatches].some(id=>!creditSettled.has(id)))throw Error('Concurrent shared provider dispatch');creditDispatches.add(entry.id);}
    else if(entry.kind==='credit-settlement'){if(!creditDispatches.has(entry.id)||creditSettled.has(entry.id)||creditUnknown.has(entry.id)||generationIds.has('context:'+entry.requestId))throw Error('Credit accounting identity differs');creditSettled.add(entry.id);generationIds.add('context:'+entry.requestId);contextCreditsConsumed+=entry.creditsConsumed;}
    else if(entry.kind==='credit-unknown'){if(!creditDispatches.has(entry.id)||creditSettled.has(entry.id)||creditUnknown.has(entry.id))throw Error('Credit accounting identity differs');creditUnknown.add(entry.id);if(entry.observedCreditsConsumed!==undefined)observedUnknownCredits.set(entry.id,entry.observedCreditsConsumed);}
   }
   else if(entry.kind==='dispatch'){if(dispatches.has(entry.id)||[...dispatches.keys()].some(id=>!settled.has(id)&&!isDisposed(id))||[...unknown].some(id=>!isDisposed(id))||[...creditDispatches].some(id=>!creditSettled.has(id)))throw Error('Concurrent or repeated shared evaluation dispatch');dispatches.set(entry.id,entry);}
   else if(entry.kind==='unknown'||entry.kind==='settlement'){const d=dispatches.get(entry.id);if(!d||settled.has(entry.id)||unknown.has(entry.id))throw Error('Shared evaluation settlement identity differs');
    if(entry.kind==='unknown'){unknown.add(entry.id);unknownEvents.set(entry.id,entry);if(entry.observedChargeMicroUsd!==undefined)observedUnknownCharges.set(entry.id,entry.observedChargeMicroUsd);}
    else{if(entry.chargedMicroUsd>d.ceilingMicroUsd||generationIds.has(entry.generationId))throw Error('Shared evaluation charge violates its reservation');generationIds.add(entry.generationId);settled.add(entry.id);chargedMicroUsd+=entry.chargedMicroUsd;}
   }
   previousDigest=evidenceDigest(JSON.stringify(entry));
  }
  if(!Number.isSafeInteger(chargedMicroUsd)||chargedMicroUsd>effectiveAuthority.capMicroUsd)throw Error('Shared evaluation budget exhausted');
  if(contextCreditsConsumed>(authority.contextCreditCap??0)||creditDispatches.size>(authority.contextCreditCap??0))throw Error('Shared credit budget exhausted');
  return {authority:effectiveAuthority,originalAuthority:authority,continuation,reviewedSource,additionalAllowanceMicroUsd,permanentHolds,unknownEvents,unresolvedDollarIds:new Set([...dispatches.keys()].filter(id=>!settled.has(id)&&!isDisposed(id))),heldMicroUsd:[...dispatches.values()].filter(d=>!settled.has(d.id)).reduce((n,d)=>n+Math.max(d.ceilingMicroUsd,observedUnknownCharges.get(d.id)??0),0),currentSource,previousDigest,ordinal:names.length+1,chargedMicroUsd,contextCreditsConsumed,observedUnknownCharges,observedUnknownCredits,creditDispatches,creditSettled,creditUnknown,dispatches,settled,unknown,generationIds};
 }
 private async append(value:Event){
  await writeEvidence(this.root,`event-${String(value.ordinal).padStart(6,'0')}.json`,event.parse(value));
  const directory=await open(this.root,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);try{await directory.sync();}finally{await directory.close();}
 }
 /** Call only after obtaining the attributable approval described by the exact
  * input. JSON is an operator record, not an automatic grant of user approval. */
 async continueAuthorization(raw:unknown){return this.lock(async()=>{
  const approval=qualityContinuationSchema.parse(raw),s=await this.read(),now=Date.now();
  if(approval.ledgerRoot!==resolve(this.root)||approval.budgetId!==s.originalAuthority.id||approval.originalAuthorizationDigest!==s.originalAuthority.authorizationDigest||approval.previousAuthorityDigest!==s.authority.authorizationDigest||approval.journalHeadDigest!==s.previousDigest||Date.parse(approval.recordedAt)<Date.parse(s.authority.expiresAt)||Date.parse(approval.recordedAt)>now||Date.parse(approval.expiresAt)<=now||s.unresolvedDollarIds.size>0||[...s.creditDispatches].some(id=>!s.creditSettled.has(id)))throw Error('Exact unencumbered original-budget continuation required');
  await this.append({kind:'continuation',id:approval.id,ordinal:s.ordinal,previousDigest:s.previousDigest,approval,observedAt:new Date().toISOString()});
  return {authorizationDigest:evidenceDigest(JSON.stringify(approval)),expiresAt:approval.expiresAt,budgetId:s.originalAuthority.id,originalAuthorizationUnchanged:true,capMicroUsd:s.originalAuthority.capMicroUsd,chargedMicroUsd:s.chargedMicroUsd,contextDispatches:s.creditDispatches.size};
 });}
 /** Manual, independently reviewed disposition and additive allowance only.
  * Original unknown entries and their entire exposure remain in this journal.
 * A clean journal may adopt a reviewed source only with zero added allowance. */
 async reviewResumption(raw:unknown){return this.lock(async()=>{const a=qualityResumptionSchema.parse(raw),s=await this.read(),now=Date.now();
  if(a.budgetId!==s.originalAuthority.id||a.ledgerRoot!==resolve(this.root)||a.originalAuthorizationDigest!==s.originalAuthority.authorizationDigest||a.previousAuthorityDigest!==s.authority.authorizationDigest||a.journalHeadDigest!==s.previousDigest||Date.parse(a.recordedAt)>now||now>=Date.parse(s.authority.expiresAt)||JSON.stringify(a.unknownDispatches.map(d=>d.id).sort())!==JSON.stringify([...s.unknown].sort())||new Set(a.unknownDispatches.map(d=>d.id)).size!==a.unknownDispatches.length||[...s.dispatches.keys()].some(id=>!s.settled.has(id)&&!s.unknown.has(id))||[...s.creditDispatches].some(id=>!s.creditSettled.has(id)))throw Error('Exact reviewed original-journal resumption required');
  for(const p of a.unknownDispatches){const d=s.dispatches.get(p.id)!,u=s.unknownEvents.get(p.id)!;if(!d||!u||p.dispatchDigest!==evidenceDigest(JSON.stringify(d))||p.unknownDigest!==evidenceDigest(JSON.stringify(u))||p.permanentHoldMicroUsd!==Math.max(d.ceilingMicroUsd,s.observedUnknownCharges.get(p.id)??0)||Date.parse(a.recordedAt)<Date.parse(u.observedAt))throw Error('Permanent original uncertainty hold differs');}
  const cap=s.authority.capMicroUsd+a.additionalAllowanceMicroUsd;if(!Number.isSafeInteger(cap)||cap>100000000||s.chargedMicroUsd+s.heldMicroUsd>cap)throw Error('Explicit additive allowance is insufficient');
  await this.append({kind:'reviewed-resumption',id:a.id,approval:a,ordinal:s.ordinal,previousDigest:s.previousDigest,observedAt:new Date().toISOString()});return {budgetId:s.originalAuthority.id,originalCapMicroUsd:s.originalAuthority.capMicroUsd,capMicroUsd:cap,permanentHeldMicroUsd:s.heldMicroUsd,unknownChargeSettled:false as const};
 });}
 async recordUnknownExposure(id:string,observedChargeMicroUsd:number,providerProofDigest:string){return this.lock(async()=>{const s=await this.read();if(!s.unknown.has(id)||!Number.isSafeInteger(observedChargeMicroUsd)||observedChargeMicroUsd<(s.observedUnknownCharges.get(id)??0))throw Error('Original unknown exposure cannot decrease');await this.append({kind:'unknown-exposure',id,observedChargeMicroUsd,providerProofDigest,ordinal:s.ordinal,previousDigest:s.previousDigest,observedAt:new Date().toISOString()});});}
 async currentAuthority(){return this.lock(async()=>{const s=await this.read();return {...s.authority,resumptionId:s.reviewedSource?.id,additionalAllowanceMicroUsd:s.additionalAllowanceMicroUsd,originalCapMicroUsd:s.originalAuthority.capMicroUsd,originalAuthorizationDigest:s.originalAuthority.authorizationDigest,originalExpiresAt:s.originalAuthority.expiresAt,journalHeadDigest:s.previousDigest,continuationId:s.continuation?.id};});}
 /** A corrected run starts the full catalog again, using the same remaining
  * allowance. Prior charges and unknown holds never disappear or reset. */
 async beginAttempt(source:{sourceCommit:string;sourceDigest:string;catalogDigest:string}){return this.lock(async()=>{const s=await this.read();if(Date.parse(s.authority.expiresAt)<=Date.now()||s.unresolvedDollarIds.size>0||[...s.creditDispatches].some(id=>!s.creditSettled.has(id)))throw Error('Unresolved provider prevents a fresh attempt');if((s.reviewedSource??s.continuation)&&(['sourceCommit','sourceDigest','catalogDigest'] as const).some(key=>source[key]!==(s.reviewedSource??s.continuation)![key]))throw Error('Continuation source differs');const id=randomUUID();await this.append({kind:'attempt',id,...source,ordinal:s.ordinal,previousDigest:s.previousDigest,observedAt:new Date().toISOString()});return id;});}
 async currentSource(){return this.lock(async()=>(await this.read()).currentSource);}
 async dispatch(raw:{modelId:'spacexai/grok-4.7'|'openai/text-embedding-3-small';ceilingMicroUsd:number;pricingDigest:string;hostedLearning?:z.infer<typeof hostedLearningDispatchSchema>},attemptId?:string){
  return this.lock(async()=>{const state=await this.read();
   if(state.currentSource.attemptId!==attemptId||(state.continuation||state.reviewedSource)&&!attemptId)throw Error('Prior quality attempt cannot dispatch');
   if(Date.parse(state.authority.expiresAt)<=Date.now()||state.unresolvedDollarIds.size||state.unresolvedDollarIds.size>0||[...state.creditDispatches].some(id=>!state.creditSettled.has(id)))throw Error('Unknown or active evaluation charge holds admission');
   if(raw.hostedLearning&&(raw.modelId!=='spacexai/grok-4.7'||raw.hostedLearning.scope.sourceCommit!==state.currentSource.sourceCommit||raw.hostedLearning.scope.sourceDigest!==state.currentSource.sourceDigest||raw.hostedLearning.scope.catalogDigest!==state.currentSource.catalogDigest||raw.hostedLearning.priceDigest!==raw.pricingDigest))throw Error('Hosted dispatch differs from original source-pinned authority');
   const id=randomUUID(),value=event.parse({kind:'dispatch',id,...raw,ordinal:state.ordinal,previousDigest:state.previousDigest,observedAt:new Date().toISOString()});
   if(value.kind!=='dispatch'||state.chargedMicroUsd+state.heldMicroUsd+value.ceilingMicroUsd>state.authority.capMicroUsd)throw Error('Evaluation budget prevents dispatch');
   await this.append(value);return id;
  });
 }
 /** Read an actual unresolved, pre-reserved hosted arm from this original journal.
  * No caller-provided receipt can replace its append-only dispatch event. */
 async hostedDispatch(id:string){return this.readHostedDispatch(id,true);}
 /** Historical accounting never grants fresh provider admission. */
 async hostedAccountingDispatch(id:string){return this.readHostedDispatch(id,false);}
 private async readHostedDispatch(id:string,requireFresh:boolean){return this.lock(async()=>{
  const state=await this.read(),dispatch=state.dispatches.get(z.uuid().parse(id));
  if(!dispatch?.hostedLearning||state.settled.has(id)||state.unknown.has(id)||(requireFresh&&Date.parse(state.authority.expiresAt)<=Date.now()))throw Error('Original unresolved hosted dispatch required');
  return {dispatch,dispatchDigest:evidenceDigest(JSON.stringify(dispatch)),journalHeadDigest:state.previousDigest,
   originalBudgetId:state.originalAuthority.id,originalAuthorizationDigest:state.originalAuthority.authorizationDigest,
   capMicroUsd:state.authority.capMicroUsd,originalCapMicroUsd:state.originalAuthority.capMicroUsd,authorityDigest:state.authority.authorizationDigest,expiresAt:state.authority.expiresAt,
   source:state.currentSource};
 });}
 async settle(id:string,raw:{chargedMicroUsd:number;inputTokens:number;outputTokens:number;generationId:string}){
  return this.lock(async()=>{const state=await this.read(),d=state.dispatches.get(id);
   if(!d||state.settled.has(id)||state.unknown.has(id))throw Error('Evaluation dispatch cannot settle');
   const parsed=event.safeParse({kind:'settlement',id,...raw,ordinal:state.ordinal,previousDigest:state.previousDigest,observedAt:new Date().toISOString()});
   if(!parsed.success||state.generationIds.has(raw.generationId)||raw.chargedMicroUsd>d.ceilingMicroUsd||raw.inputTokens>(d.modelId==='openai/text-embedding-3-small'?300000:500000)||raw.outputTokens>(d.modelId==='openai/text-embedding-3-small'?0:500000)){await this.append({kind:'unknown',id,reason:raw.chargedMicroUsd>d.ceilingMicroUsd?'overrun':'invalid_accounting',observedChargeMicroUsd:micro.safeParse(raw.chargedMicroUsd).success?raw.chargedMicroUsd:undefined,ordinal:state.ordinal,previousDigest:state.previousDigest,observedAt:new Date().toISOString()});throw Error('Evaluation charge requires operator review');}
   await this.append(parsed.data);
  });
 }
 async hold(id:string,reason:Extract<Event,{kind:'unknown'}>['reason']){
  return this.lock(async()=>{const state=await this.read();if(state.settled.has(id)||state.unknown.has(id))return;if(!state.dispatches.has(id))throw Error('Unknown evaluation dispatch');await this.append({kind:'unknown',id,reason,ordinal:state.ordinal,previousDigest:state.previousDigest,observedAt:new Date().toISOString()});});
 }
 async reserveCredit(accountProofDigest:string,attemptId?:string){return this.lock(async()=>{const s=await this.read();if(s.currentSource.attemptId!==attemptId||(s.continuation||s.reviewedSource)&&!attemptId)throw Error('Prior quality attempt cannot dispatch');if(Date.parse(s.authority.expiresAt)<=Date.now()||s.unresolvedDollarIds.size||s.unresolvedDollarIds.size>0||[...s.creditDispatches].some(id=>!s.creditSettled.has(id)))throw Error('Provider accounting holds admission');if(s.creditDispatches.size>=(s.authority.contextCreditCap??0))throw Error('Explicit research credit budget required');const id=randomUUID();await this.append({kind:'credit-dispatch',id,ordinal:s.ordinal,previousDigest:s.previousDigest,ceilingCredits:1,accountProofDigest,observedAt:new Date().toISOString()});return id;});}
 async settleCredit(id:string,creditsConsumed:number,requestId:string,accountProofDigest:string){return this.lock(async()=>{const s=await this.read();if(!s.creditDispatches.has(id)||s.creditSettled.has(id)||s.creditUnknown.has(id))throw Error('Credit operation cannot settle');const parsed=event.safeParse({kind:'credit-settlement',id,ordinal:s.ordinal,previousDigest:s.previousDigest,creditsConsumed,requestId,accountProofDigest,observedAt:new Date().toISOString()});if(!parsed.success||s.generationIds.has('context:'+requestId)){await this.append({kind:'credit-unknown',id,observedCreditsConsumed:micro.safeParse(creditsConsumed).success?creditsConsumed:undefined,ordinal:s.ordinal,previousDigest:s.previousDigest,observedAt:new Date().toISOString()});throw Error('Credit charge requires operator review');}await this.append(parsed.data);});}
 async holdCredit(id:string){return this.lock(async()=>{const s=await this.read();if(s.creditSettled.has(id)||s.creditUnknown.has(id))return;if(!s.creditDispatches.has(id))throw Error('Unknown credit operation');await this.append({kind:'credit-unknown',id,ordinal:s.ordinal,previousDigest:s.previousDigest,observedAt:new Date().toISOString()});});}
 async status(){return this.lock(async()=>{const s=await this.read();return {chargedMicroUsd:s.chargedMicroUsd,heldMicroUsd:[...s.dispatches.values()].filter(d=>!s.settled.has(d.id)).reduce((sum,d)=>sum+Math.max(d.ceilingMicroUsd,s.observedUnknownCharges.get(d.id)??0),0),capMicroUsd:s.authority.capMicroUsd,originalCapMicroUsd:s.originalAuthority.capMicroUsd,additionalAllowanceMicroUsd:s.additionalAllowanceMicroUsd,permanentHeldMicroUsd:[...s.permanentHolds.values()].reduce((n,v)=>n+v,0),contextCreditsConsumed:s.contextCreditsConsumed,contextCreditsHeld:[...s.creditDispatches].filter(id=>!s.creditSettled.has(id)).reduce((sum,id)=>sum+Math.max(1,s.observedUnknownCredits.get(id)??0),0),contextCreditCap:s.authority.contextCreditCap??0,contextDispatches:s.creditDispatches.size,dispatches:s.dispatches.size,unknown:s.unknown.size+s.creditUnknown.size,admissionHeld:s.unresolvedDollarIds.size>0||[...s.creditDispatches].some(id=>!s.creditSettled.has(id))||Date.parse(s.authority.expiresAt)<=Date.now()};});}
}
