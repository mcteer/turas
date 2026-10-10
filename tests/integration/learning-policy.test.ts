import { describe,it,expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { withLearningDatabase } from '../fixtures/learning/environment';
import { learningTestActors } from '../fixtures/learning/setup';
import { lockInternalLearningActor,lockLearningPublisher,learningActorGeneration } from '../../lib/server/learning/policy';
import { learningInputDigest,storeLearningReceipt,findLearningReceipt,checkLearningReplay,learningRequestStatus } from '../../lib/server/learning/receipts';
describe('current learning authority and receipts',()=>{
 it('retains 005 admin authority and denies member publication and partner private work',()=>withLearningDatabase(async db=>{
  const actors=await learningTestActors(db);
  await lockLearningPublisher(db,actors.admin);
  await lockInternalLearningActor(db,actors.member);
  await expect(lockLearningPublisher(db,actors.member)).rejects.toMatchObject({status:403});
  await expect(lockInternalLearningActor(db,actors.partner)).rejects.toMatchObject({status:403});
  expect(await learningActorGeneration(db,actors.admin)).toBeGreaterThan(0);
  await db.query('UPDATE memberships SET active=false WHERE id=$1',[actors.member.membershipId]);
  await expect(lockInternalLearningActor(db,actors.member)).rejects.toMatchObject({status:401});
  await db.query('UPDATE memberships SET active=true WHERE id=$1',[actors.member.membershipId]);
 }));
 it('finds prior-key receipts after rotation and rejects changed replays',()=>withLearningDatabase(async db=>{
  const actor=(await learningTestActors(db)).admin,requestId=randomUUID(),input={requestId,text:'Synthetic private feedback'};
  const previous=process.env.TURAS_014_RECEIPT_HASH_KEYS;
  try{
   process.env.TURAS_014_RECEIPT_HASH_KEYS=JSON.stringify(['old-synthetic-key-'.repeat(3)]);
   const digest=learningInputDigest(input);
   await storeLearningReceipt(db,actor,{requestId,action:'feedback.create',digest,customerId:null,targetId:randomUUID(),version:1});
   process.env.TURAS_014_RECEIPT_HASH_KEYS=JSON.stringify(['new-synthetic-key-'.repeat(3),'old-synthetic-key-'.repeat(3)]);
   const prior=await findLearningReceipt(db,actor,requestId);expect(prior).toBeDefined();
   expect(checkLearningReplay(prior,learningInputDigest(input,prior.hash_key_id),'feedback.create').outcome).toBe('committed');
   expect(()=>checkLearningReplay(prior,learningInputDigest({...input,text:'Changed'},prior.hash_key_id),'feedback.create')).toThrow();
   process.env.TURAS_014_RECEIPT_HASH_KEYS=JSON.stringify(['new-synthetic-key-'.repeat(3)]);
   expect(await findLearningReceipt(db,actor,requestId)).toBeDefined();
   expect(()=>learningInputDigest(input,prior.hash_key_id)).toThrow();
  }finally{if(previous===undefined)delete process.env.TURAS_014_RECEIPT_HASH_KEYS;else process.env.TURAS_014_RECEIPT_HASH_KEYS=previous;}
 }));
 it('abandonment leaves a durable tombstone and never admits a late original',()=>withLearningDatabase(async db=>{
  const actor=(await learningTestActors(db)).admin,requestId=randomUUID();
  const receipt=await learningRequestStatus(db,actor,requestId,true,async()=>{});
  expect(receipt.outcome).toBe('abandoned');
  const prior=await findLearningReceipt(db,actor,requestId);
  expect(()=>checkLearningReplay(prior,learningInputDigest({requestId}),'feedback.create')).toThrow();
  expect((await learningRequestStatus(db,actor,requestId,false,async()=>{})).outcome).toBe('abandoned');
 }));

 it('minimizes expired receipt metadata while keeping its environment-lifetime identity',()=>withLearningDatabase(async db=>{
  const actor=(await learningTestActors(db)).admin,requestId=randomUUID(),targetId=randomUUID(),input={requestId,text:'Expired synthetic input'};
  const stored=await storeLearningReceipt(db,actor,{requestId,action:'feedback.create',digest:learningInputDigest(input),customerId:null,targetId,version:1});
  expect(stored.outcome).toBe('committed');
  // A historic fixture is inserted rather than mutating immutable timestamps.
  const historic=randomUUID(),digest=learningInputDigest({requestId:historic});
  const {learningActorHash,learningKeyId}=await import('../../lib/server/learning/receipts');
  await db.query(`INSERT INTO learning_command_receipts(id,environment_id,workspace_id,actor_hash,request_id,action,input_digest,hash_key_id,target_id,version,outcome,created_at)
   VALUES($1,$2,$3,$4,$5,'feedback.create',$6,$7,$8,1,'committed',clock_timestamp()-interval '366 days')`,[randomUUID(),process.env.TURAS_ENVIRONMENT_ID,actor.workspaceId,learningActorHash(actor),historic,digest,learningKeyId(),targetId]);
  await db.query('SELECT turas_learning_purge($1,100)',[process.env.TURAS_ENVIRONMENT_ID]);
  const prior=await findLearningReceipt(db,actor,historic);
  expect(prior).toMatchObject({outcome:'retired',target_id:null,version:null,created_at:null,input_digest:digest});
  expect(()=>checkLearningReplay(prior,digest,'feedback.create')).toThrow();
  expect((await findLearningReceipt(db,actor,requestId)).outcome).toBe('committed');
 }));

});
