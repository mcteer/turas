import { describe,it,expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { withLearningDatabase } from '../fixtures/learning/environment';
import { learningTestActors,learningPartnerPeer } from '../fixtures/learning/setup';
import { createLearningFeedback,readLearningFeedback,reviseLearningFeedback,disposeLearningFeedback,listLearningFeedback } from '../../lib/server/learning/feedback';
import { DEMO_IDS } from '../../lib/server/bootstrap-ids';
describe('private proposed learning feedback',()=>{
 it('keeps partner issues owner-private, exact-target and explicitly unverified',()=>withLearningDatabase(async db=>{
  const actors=await learningTestActors(db),peer=await learningPartnerPeer(db);
  const head=(await db.query(`SELECT p.id,p.revision_id,p.head_generation,r.content_digest FROM knowledge_publications p JOIN knowledge_revisions r ON r.id=p.revision_id JOIN knowledge_revision_payloads b ON b.revision_id=r.id WHERE b.payload->>'title'='Canonical synthetic learning practice' AND p.state='published'`)).rows[0];
  const target={kind:'shared_practice' as const,id:head.id,revisionId:head.revision_id,generation:Number(head.head_generation),digest:head.content_digest};
  await db.query('UPDATE learning_workspace_state SET enabled=true WHERE workspace_id=$1',[DEMO_IDS.workspace]);
  try{
   const input={contractVersion:'learning-v1',requestId:randomUUID(),expectedVersion:0,target,category:'unclear',text:'Synthetic user observation, not an accepted fact'};
   const receipt=await createLearningFeedback(actors.partner,input);
   expect((await createLearningFeedback(actors.partner,input)).targetId).toBe(receipt.targetId);
   await expect(createLearningFeedback(actors.partner,{...input,text:'Changed replay body'})).rejects.toMatchObject({status:409});
   expect((await listLearningFeedback(peer,{})).items.some(item=>item.id===receipt.targetId)).toBe(false);
   expect((await listLearningFeedback(actors.partner,{})).items.some(item=>item.id===receipt.targetId)).toBe(true);
   const own=await readLearningFeedback(actors.partner,receipt.targetId!);
   expect(own.text).toBe(input.text);expect(own.verification).toBe('unverified_feedback');
   await expect(readLearningFeedback(peer,receipt.targetId!)).rejects.toMatchObject({status:404});
   await expect(reviseLearningFeedback(peer,receipt.targetId!,{contractVersion:'learning-v1',requestId:randomUUID(),expectedVersion:1,text:'Peer edit'})).rejects.toMatchObject({status:404});
   await reviseLearningFeedback(actors.partner,receipt.targetId!,{contractVersion:'learning-v1',requestId:randomUUID(),expectedVersion:1,text:'Corrected synthetic observation'});
   await expect(reviseLearningFeedback(actors.partner,receipt.targetId!,{contractVersion:'learning-v1',requestId:randomUUID(),expectedVersion:1,text:'Stale edit'})).rejects.toMatchObject({status:409});
   await disposeLearningFeedback(actors.member,receipt.targetId!,{contractVersion:'learning-v1',requestId:randomUUID(),expectedVersion:2,state:'deferred',rationale:'PRIVATE_INTERNAL_TRIAGE'});
   const partnerView=await readLearningFeedback(actors.partner,receipt.targetId!);
   expect(partnerView.disposition).toBe('deferred');expect(JSON.stringify(partnerView)).not.toContain('PRIVATE_INTERNAL_TRIAGE');
   expect((await readLearningFeedback(actors.member,receipt.targetId!)).history.some(item=>item.rationale==='PRIVATE_INTERNAL_TRIAGE')).toBe(true);
   await expect(createLearningFeedback(actors.partner,{...input,requestId:randomUUID(),target:{...target,generation:target.generation+1}})).rejects.toMatchObject({status:404});
  }finally{await db.query('UPDATE learning_workspace_state SET enabled=false WHERE workspace_id=$1',[DEMO_IDS.workspace]);}
 }));
});
