import { describe,it,expect } from 'vitest';
import { withLearningDatabase } from '../fixtures/learning/environment';
import { learningTestActors,learningAcceptedOriginal } from '../fixtures/learning/setup';
import { learningSourceClosure } from '../../lib/server/learning/sources';
import { DEMO_IDS } from '../../lib/server/bootstrap-ids';
describe('learning original closure',()=>{
 it('binds exact accepted originals and explicit reuse rights independently of wording',()=>withLearningDatabase(async db=>{
  const actors=await learningTestActors(db),ref=await learningAcceptedOriginal(db,actors.member,actors.admin,DEMO_IDS.sharedCustomer);
  const first=await learningSourceClosure(db,actors.member,DEMO_IDS.sharedCustomer,[ref]);
  expect(first.originals).toHaveLength(1);
  const changed=await learningSourceClosure(db,actors.member,DEMO_IDS.sharedCustomer,[{...ref,rightsBasis:'Different explicit rights basis'}]);
  expect(changed.closureDigest).toBe(first.closureDigest);expect(changed.rightsDigest).not.toBe(first.rightsDigest);
  await expect(learningSourceClosure(db,actors.member,DEMO_IDS.deniedCustomer,[ref])).rejects.toMatchObject({status:404});
  await expect(learningSourceClosure(db,actors.member,DEMO_IDS.sharedCustomer,[{...ref,sourceGeneration:ref.sourceGeneration+1}])).rejects.toMatchObject({status:404});
  await db.query('UPDATE profile_records SET current_accepted_revision_id=NULL WHERE id=(SELECT record_id FROM profile_revisions WHERE id=$1)',[ref.sourceRevisionId]);
  await expect(learningSourceClosure(db,actors.member,DEMO_IDS.sharedCustomer,[ref])).rejects.toMatchObject({status:404});
 }));
});
