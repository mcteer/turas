import {beforeAll,describe,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import type {CurrentSession} from '../../lib/server/auth/sessions';
import {withExpansionDatabase} from '../fixtures/expansion/environment';
import {createProfileTestSession} from '../fixtures/profiles';
import {startExpansionNative} from '../fixtures/expansion/native';
import {discoveryHypothesis} from '../fixtures/expansion';
import {acceptedExpansionEvidence} from '../fixtures/expansion/evidence';
import {readExpansionInitialContext} from '../../lib/server/expansion/native';
import {admitGovernedModelStep} from '../../lib/server/conversations/model-admission';
import {readExpansionAdviceStatus} from '../../lib/server/expansion/advice-status';
import {saveExpansionSuggestion} from '../../lib/server/expansion/suggestions';
import {expansionHash} from '../../lib/server/expansion/commands';
import {DEMO_IDS} from '../../lib/server/bootstrap-ids';
const result=(content:ReturnType<typeof discoveryHypothesis>,citationKeys:string[]=[])=>({contractVersion:'expansion-advice-v1',summary:'Validate the selected operating need before changing the solution.',facts:[],unknowns:[{text:'Customer agreement',reason:'Not established by selected evidence'}],discoverySteps:[],proposals:[{content,citationKeys,relatedHypothesisIds:[]}]});
describe('Explicit human expansion suggestion saving',()=>{
 let actor:CurrentSession,other:CurrentSession;
 beforeAll(async()=>{({actor,other}=await withExpansionDatabase(async db=>({actor:await createProfileTestSession(db,'panel'),other:await createProfileTestSession(db,'mcteer')})));});
 async function finish(f:Awaited<ReturnType<typeof startExpansionNative>>,output:ReturnType<typeof result>){
  await readExpansionInitialContext(f.principal,f.turnId,f.nativeSessionId);await admitGovernedModelStep(f.principal,f.identity);
  await f.event('message.completed',{message:JSON.stringify(output),finishReason:'stop'});await f.event('step.completed',{stepIndex:0,usage:{inputTokens:1,outputTokens:1}});await f.event('turn.completed');
 }
 it('requires completed private exact output and preserves human edits, proposed disposition and immutable origin with same-key replay',async()=>{
  const f=await startExpansionNative(actor),output=result(discoveryHypothesis());await finish(f,output);
  const command={contractVersion:'expansion-v1',operation:'save_suggestion',requestKey:randomUUID(),workloadId:f.workloadId,expectedVersion:0,attemptId:f.attemptId,outputDigest:expansionHash(output),suggestionIndex:0,content:{...output.proposals[0]!.content,title:'Explicit human-edited proposal'},sourceRefs:[],selectedEngagementIds:[],deliveryLinks:[]};
  await expect(saveExpansionSuggestion(other,DEMO_IDS.sharedCustomer,command)).rejects.toMatchObject({status:404});
  await expect(saveExpansionSuggestion(actor,DEMO_IDS.sharedCustomer,{...command,outputDigest:'a'.repeat(64)})).rejects.toMatchObject({code:'suggestion_unavailable'});
  await expect(saveExpansionSuggestion(actor,DEMO_IDS.sharedCustomer,{...command,suggestionIndex:4})).rejects.toMatchObject({code:'suggestion_unavailable'});
  const saved=await saveExpansionSuggestion(actor,DEMO_IDS.sharedCustomer,command);expect(saved).toMatchObject({operation:'save_suggestion',outcome:'proposed'});
  expect(await saveExpansionSuggestion(actor,DEMO_IDS.sharedCustomer,command)).toEqual(saved);
  const row=(await withExpansionDatabase(db=>db.query(`SELECT h.disposition,h.decided_revision_id,r.advice_attempt_id,r.advice_output_digest,r.advice_suggestion_index,p.content
   FROM expansion_hypotheses h JOIN expansion_revisions r ON r.id=h.working_revision_id JOIN expansion_payloads p ON p.revision_id=r.id WHERE h.id=$1`,[saved.recordId]))).rows[0];
  expect(row).toMatchObject({disposition:'proposed',decided_revision_id:null,advice_attempt_id:f.attemptId,advice_output_digest:command.outputDigest,advice_suggestion_index:0,content:{content:{title:command.content.title}}});
  expect(await readExpansionAdviceStatus(actor,DEMO_IDS.sharedCustomer,f.attemptId)).toMatchObject({result:null,current:false,retained:false});
 });
 it('retains the original suggestion citation map even when human edits remove an assertion and forbids replacing its identity',async()=>{
  const evidence=await acceptedExpansionEvidence(actor,other,DEMO_IDS.sharedCustomer,null,'Synthetic reviewed operating observation.','synthetic-original-reference','adoption_process');
  const f=await startExpansionNative(actor,[evidence.reference]);
  const content={...discoveryHypothesis(),assertions:[{purpose:'customer_need' as const,classification:'accepted_fact' as const,text:'Synthetic reviewed operating observation.',sourceKeys:[evidence.reference.id]}]};
  const output=result(content,[evidence.reference.id]);await finish(f,output);
  const command={contractVersion:'expansion-v1',operation:'save_suggestion',requestKey:randomUUID(),workloadId:f.workloadId,expectedVersion:0,attemptId:f.attemptId,outputDigest:expansionHash(output),suggestionIndex:0,content:{...content,assertions:[]},sourceRefs:[],selectedEngagementIds:[],deliveryLinks:[]};
  await expect(saveExpansionSuggestion(actor,DEMO_IDS.sharedCustomer,{...command,sourceRefs:[{...evidence.reference,contentDigest:'b'.repeat(64)}]})).rejects.toMatchObject({code:'invalid_source'});
  const saved=await saveExpansionSuggestion(actor,DEMO_IDS.sharedCustomer,command);
  const refs=(await withExpansionDatabase(db=>db.query('SELECT content FROM expansion_payloads WHERE revision_id=$1',[saved.revisionId]))).rows[0].content.sourceRefs;
  expect(refs).toHaveLength(1);expect(refs[0]).toMatchObject({id:evidence.reference.id,sourceRevisionId:evidence.reference.sourceRevisionId,contentDigest:evidence.reference.contentDigest});expect(refs[0]).not.toHaveProperty('citationId');
 });
 it('allows additional human-selected original evidence without changing the retained model fence',async()=>{
  const original=await acceptedExpansionEvidence(actor,other,DEMO_IDS.sharedCustomer,null,'Original reviewed operating observation.','synthetic-origin-plus-extra','adoption_process');
  const extra=await acceptedExpansionEvidence(actor,other,DEMO_IDS.sharedCustomer,null,'Additional reviewed operating constraint.','synthetic-extra-reference','adoption_process');
  const f=await startExpansionNative(actor,[original.reference]),output=result(discoveryHypothesis(),[original.reference.id]);await finish(f,output);
  const saved=await saveExpansionSuggestion(actor,DEMO_IDS.sharedCustomer,{contractVersion:'expansion-v1',operation:'save_suggestion',requestKey:randomUUID(),workloadId:f.workloadId,expectedVersion:0,attemptId:f.attemptId,outputDigest:expansionHash(output),suggestionIndex:0,content:{...output.proposals[0]!.content,assertions:[{purpose:'customer_need',classification:'accepted_fact',text:'Additional reviewed operating constraint.',sourceKeys:[extra.reference.id]}]},sourceRefs:[extra.reference],selectedEngagementIds:[],deliveryLinks:[]});
  const refs=(await withExpansionDatabase(db=>db.query('SELECT content FROM expansion_payloads WHERE revision_id=$1',[saved.revisionId]))).rows[0].content.sourceRefs;expect(refs).toHaveLength(2);expect(new Set(refs.map((ref:{id:string})=>ref.id))).toEqual(new Set([original.reference.id,extra.reference.id]));
 });
 it('denies saving a running attempt before validated final release',async()=>{
  const f=await startExpansionNative(actor);
  await expect(saveExpansionSuggestion(actor,DEMO_IDS.sharedCustomer,{contractVersion:'expansion-v1',operation:'save_suggestion',requestKey:randomUUID(),workloadId:f.workloadId,expectedVersion:0,attemptId:f.attemptId,outputDigest:'a'.repeat(64),suggestionIndex:0,content:discoveryHypothesis(),sourceRefs:[],selectedEngagementIds:[],deliveryLinks:[]})).rejects.toMatchObject({code:'suggestion_unavailable'});
 });
});
