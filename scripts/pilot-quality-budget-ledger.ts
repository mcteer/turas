import {constants} from 'node:fs';
import {lstat,mkdir,open,readdir,realpath,rmdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {createEvidenceDirectory,readEvidence,writeEvidence,evidenceDigest} from './pilot-evidence';

const digest=z.string().regex(/^[a-f0-9]{64}$/),micro=z.number().int().nonnegative().safe();
const authorization=z.strictObject({contract:z.literal('pilot-quality-budget-v1'),id:z.uuid(),capMicroUsd:micro.positive(),contextCreditCap:z.number().int().min(0).max(4).optional(),authorizationDigest:digest,sourceDigest:digest,catalogDigest:digest,modelId:z.literal('spacexai/grok-4.7'),expiresAt:z.iso.datetime({offset:true})});
const event=z.discriminatedUnion('kind',[
 z.strictObject({kind:z.literal('attempt'),id:z.uuid(),ordinal:z.number().int().positive(),previousDigest:digest,sourceCommit:z.string().regex(/^[a-f0-9]{40}$/),sourceDigest:digest,catalogDigest:digest,observedAt:z.iso.datetime({offset:true})}),
 z.strictObject({kind:z.literal('dispatch'),id:z.uuid(),ordinal:z.number().int().positive(),previousDigest:digest,modelId:z.enum(['spacexai/grok-4.7','openai/text-embedding-3-small']),ceilingMicroUsd:micro.positive(),pricingDigest:digest,observedAt:z.iso.datetime({offset:true})}),
 z.strictObject({kind:z.literal('settlement'),id:z.uuid(),ordinal:z.number().int().positive(),previousDigest:digest,chargedMicroUsd:micro,inputTokens:micro,outputTokens:micro,generationId:z.string().min(1).max(256),observedAt:z.iso.datetime({offset:true})}),
 z.strictObject({kind:z.literal('unknown'),id:z.uuid(),ordinal:z.number().int().positive(),previousDigest:digest,reason:z.enum(['provider_error','incomplete_stream','invalid_accounting','overrun','aborted']),observedChargeMicroUsd:micro.optional(),observedAt:z.iso.datetime({offset:true})}),
 z.strictObject({kind:z.literal('credit-dispatch'),id:z.uuid(),ordinal:z.number().int().positive(),previousDigest:digest,ceilingCredits:z.literal(1),accountProofDigest:digest,observedAt:z.iso.datetime({offset:true})}),
 z.strictObject({kind:z.literal('credit-settlement'),id:z.uuid(),ordinal:z.number().int().positive(),previousDigest:digest,creditsConsumed:z.number().int().min(0).max(1),requestId:z.string().min(1).max(256),accountProofDigest:digest,observedAt:z.iso.datetime({offset:true})}),
 z.strictObject({kind:z.literal('credit-unknown'),id:z.uuid(),ordinal:z.number().int().positive(),previousDigest:digest,observedCreditsConsumed:micro.optional(),observedAt:z.iso.datetime({offset:true})}),
]);
type Event=z.infer<typeof event>;

/** Evaluation-only shared accounting outside disposable application copies.
 * A failed/uncertain dispatch blocks the whole batch; no stale-lock stealing,
 * retry, release, budget expansion, or inferred provider charge exists here. */
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
  let currentSource:{sourceCommit?:string;sourceDigest:string;catalogDigest:string;attemptId?:string}={sourceDigest:authority.sourceDigest,catalogDigest:authority.catalogDigest};
  const dispatches=new Map<string,Extract<Event,{kind:'dispatch'}>>(),observedUnknownCharges=new Map<string,number>(),observedUnknownCredits=new Map<string,number>(),creditDispatches=new Set<string>(),creditSettled=new Set<string>(),creditUnknown=new Set<string>(),settled=new Set<string>(),unknown=new Set<string>(),generationIds=new Set<string>();
  for(const [index,name] of names.entries()){
   if(name!==`event-${String(index+1).padStart(6,'0')}.json`)throw Error('Incomplete shared evaluation journal');
   const entry=event.parse(await readEvidence(this.root,name));if(entry.ordinal!==index+1||entry.previousDigest!==previousDigest)throw Error('Shared evaluation journal identity differs');
   previousDigest=evidenceDigest(JSON.stringify(entry));
   if(entry.kind==='attempt'){if([...dispatches.keys()].some(id=>!settled.has(id))||[...creditDispatches].some(id=>!creditSettled.has(id)))throw Error('An unresolved provider prevents a fresh attempt');currentSource={sourceCommit:entry.sourceCommit,sourceDigest:entry.sourceDigest,catalogDigest:entry.catalogDigest,attemptId:entry.id};}
   else if(entry.kind.startsWith('credit-')){
    if(entry.kind==='credit-dispatch'){if(creditDispatches.has(entry.id)||[...dispatches.keys()].some(id=>!settled.has(id))||[...creditDispatches].some(id=>!creditSettled.has(id)))throw Error('Concurrent shared provider dispatch');creditDispatches.add(entry.id);}
    else if(entry.kind==='credit-settlement'){if(!creditDispatches.has(entry.id)||creditSettled.has(entry.id)||creditUnknown.has(entry.id)||generationIds.has('context:'+entry.requestId))throw Error('Credit accounting identity differs');creditSettled.add(entry.id);generationIds.add('context:'+entry.requestId);contextCreditsConsumed+=entry.creditsConsumed;}
    else if(entry.kind==='credit-unknown'){if(!creditDispatches.has(entry.id)||creditSettled.has(entry.id)||creditUnknown.has(entry.id))throw Error('Credit accounting identity differs');creditUnknown.add(entry.id);if(entry.observedCreditsConsumed!==undefined)observedUnknownCredits.set(entry.id,entry.observedCreditsConsumed);}
   }
   else if(entry.kind==='dispatch'){if(dispatches.has(entry.id)||[...dispatches.keys()].some(id=>!settled.has(id))||unknown.size||[...creditDispatches].some(id=>!creditSettled.has(id)))throw Error('Concurrent or repeated shared evaluation dispatch');dispatches.set(entry.id,entry);}
   else if(entry.kind==='unknown'||entry.kind==='settlement'){const d=dispatches.get(entry.id);if(!d||settled.has(entry.id)||unknown.has(entry.id))throw Error('Shared evaluation settlement identity differs');
    if(entry.kind==='unknown'){unknown.add(entry.id);if(entry.observedChargeMicroUsd!==undefined)observedUnknownCharges.set(entry.id,entry.observedChargeMicroUsd);}
    else{if(entry.chargedMicroUsd>d.ceilingMicroUsd||generationIds.has(entry.generationId))throw Error('Shared evaluation charge violates its reservation');generationIds.add(entry.generationId);settled.add(entry.id);chargedMicroUsd+=entry.chargedMicroUsd;}
   }
  }
  if(!Number.isSafeInteger(chargedMicroUsd)||chargedMicroUsd>authority.capMicroUsd)throw Error('Shared evaluation budget exhausted');
  if(contextCreditsConsumed>(authority.contextCreditCap??0)||creditDispatches.size>(authority.contextCreditCap??0))throw Error('Shared credit budget exhausted');
  return {authority,currentSource,previousDigest,ordinal:names.length+1,chargedMicroUsd,contextCreditsConsumed,observedUnknownCharges,observedUnknownCredits,creditDispatches,creditSettled,creditUnknown,dispatches,settled,unknown,generationIds};
 }
 private async append(value:Event){
  await writeEvidence(this.root,`event-${String(value.ordinal).padStart(6,'0')}.json`,event.parse(value));
  const directory=await open(this.root,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);try{await directory.sync();}finally{await directory.close();}
 }
 /** A corrected run starts the full catalog again, using the same remaining
  * allowance. Prior charges and unknown holds never disappear or reset. */
 async beginAttempt(source:{sourceCommit:string;sourceDigest:string;catalogDigest:string}){return this.lock(async()=>{const s=await this.read();if(Date.parse(s.authority.expiresAt)<=Date.now()||[...s.dispatches.keys()].some(id=>!s.settled.has(id))||[...s.creditDispatches].some(id=>!s.creditSettled.has(id)))throw Error('Unresolved provider prevents a fresh attempt');const id=randomUUID();await this.append({kind:'attempt',id,...source,ordinal:s.ordinal,previousDigest:s.previousDigest,observedAt:new Date().toISOString()});return id;});}
 async currentSource(){return this.lock(async()=>(await this.read()).currentSource);}
 async dispatch(raw:{modelId:'spacexai/grok-4.7'|'openai/text-embedding-3-small';ceilingMicroUsd:number;pricingDigest:string},attemptId?:string){
  return this.lock(async()=>{const state=await this.read();
   if(state.currentSource.attemptId!==attemptId)throw Error('Prior quality attempt cannot dispatch');
   if(Date.parse(state.authority.expiresAt)<=Date.now()||state.unknown.size||[...state.dispatches.keys()].some(id=>!state.settled.has(id))||[...state.creditDispatches].some(id=>!state.creditSettled.has(id)))throw Error('Unknown or active evaluation charge holds admission');
   const id=randomUUID(),value=event.parse({kind:'dispatch',id,...raw,ordinal:state.ordinal,previousDigest:state.previousDigest,observedAt:new Date().toISOString()});
   if(value.kind!=='dispatch'||state.chargedMicroUsd+value.ceilingMicroUsd>state.authority.capMicroUsd)throw Error('Evaluation budget prevents dispatch');
   await this.append(value);return id;
  });
 }
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
 async reserveCredit(accountProofDigest:string,attemptId?:string){return this.lock(async()=>{const s=await this.read();if(s.currentSource.attemptId!==attemptId)throw Error('Prior quality attempt cannot dispatch');if(Date.parse(s.authority.expiresAt)<=Date.now()||s.unknown.size||[...s.dispatches.keys()].some(id=>!s.settled.has(id))||[...s.creditDispatches].some(id=>!s.creditSettled.has(id)))throw Error('Provider accounting holds admission');if(s.creditDispatches.size>=(s.authority.contextCreditCap??0))throw Error('Explicit research credit budget required');const id=randomUUID();await this.append({kind:'credit-dispatch',id,ordinal:s.ordinal,previousDigest:s.previousDigest,ceilingCredits:1,accountProofDigest,observedAt:new Date().toISOString()});return id;});}
 async settleCredit(id:string,creditsConsumed:number,requestId:string,accountProofDigest:string){return this.lock(async()=>{const s=await this.read();if(!s.creditDispatches.has(id)||s.creditSettled.has(id)||s.creditUnknown.has(id))throw Error('Credit operation cannot settle');const parsed=event.safeParse({kind:'credit-settlement',id,ordinal:s.ordinal,previousDigest:s.previousDigest,creditsConsumed,requestId,accountProofDigest,observedAt:new Date().toISOString()});if(!parsed.success||s.generationIds.has('context:'+requestId)){await this.append({kind:'credit-unknown',id,observedCreditsConsumed:micro.safeParse(creditsConsumed).success?creditsConsumed:undefined,ordinal:s.ordinal,previousDigest:s.previousDigest,observedAt:new Date().toISOString()});throw Error('Credit charge requires operator review');}await this.append(parsed.data);});}
 async holdCredit(id:string){return this.lock(async()=>{const s=await this.read();if(s.creditSettled.has(id)||s.creditUnknown.has(id))return;if(!s.creditDispatches.has(id))throw Error('Unknown credit operation');await this.append({kind:'credit-unknown',id,ordinal:s.ordinal,previousDigest:s.previousDigest,observedAt:new Date().toISOString()});});}
 async status(){return this.lock(async()=>{const s=await this.read();return {chargedMicroUsd:s.chargedMicroUsd,heldMicroUsd:[...s.dispatches.values()].filter(d=>!s.settled.has(d.id)).reduce((sum,d)=>sum+Math.max(d.ceilingMicroUsd,s.observedUnknownCharges.get(d.id)??0),0),capMicroUsd:s.authority.capMicroUsd,contextCreditsConsumed:s.contextCreditsConsumed,contextCreditsHeld:[...s.creditDispatches].filter(id=>!s.creditSettled.has(id)).reduce((sum,id)=>sum+Math.max(1,s.observedUnknownCredits.get(id)??0),0),contextCreditCap:s.authority.contextCreditCap??0,contextDispatches:s.creditDispatches.size,dispatches:s.dispatches.size,unknown:s.unknown.size+s.creditUnknown.size,admissionHeld:s.unknown.size>0||[...s.dispatches.keys()].some(id=>!s.settled.has(id))||[...s.creditDispatches].some(id=>!s.creditSettled.has(id))||Date.parse(s.authority.expiresAt)<=Date.now()};});}
}
