import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { withLearningDatabase } from '../fixtures/learning/environment';
import { activateLearning } from '../../scripts/learning-activate';
import { requireOwnedLearningDatabase } from '../../scripts/learning-environment';
import { learningTestActors,learningAcceptedOriginal } from '../fixtures/learning/setup';
import { createKnowledgeCandidate,submitKnowledgeCandidate,decideKnowledgeCandidate } from '../../lib/server/knowledge/service';
import { scheduleLearningPayloadPurge } from '../../lib/server/learning/retention';
import { DEMO_IDS } from '../../lib/server/bootstrap-ids';
describe('learning database foundation', () => {
  it('has all explicit migrations, an inactive gate and scoped state', async () => withLearningDatabase(async db => {
    expect((await db.query('SELECT schema_version FROM turas_environment')).rows[0].schema_version).toBe(JSON.parse(readFileSync('migrations/manifest.json','utf8')).version);
    const state=(await db.query('SELECT enabled,gate_activated_at FROM learning_workspace_state WHERE workspace_id=$1',[DEMO_IDS.workspace])).rows[0];
    expect(state).toEqual({enabled:false,gate_activated_at:null});
    await expect(db.query(`INSERT INTO learning_feedback(id,environment_id,workspace_id,author_membership_id,target_kind,target_id,target_revision_id,target_generation,target_digest,category) VALUES($1,$2,$3,$4,'shared_practice',$5,$6,1,$7,'unclear')`,[randomUUID(),process.env.TURAS_ENVIRONMENT_ID,randomUUID(),DEMO_IDS.panelMembership,randomUUID(),randomUUID(),'a'.repeat(64)])).rejects.toMatchObject({code:'23503'});
  }));
  it('denies runtime gate changes, archive access and direct payload purge', async () => withLearningDatabase(async db => {
    const grants=(await db.query(`SELECT has_table_privilege('turas_runtime','learning_workspace_state','UPDATE') AS gate,
      has_schema_privilege('turas_runtime','public','USAGE') AS runtime,
      has_table_privilege('turas_runtime','learning_feedback_payloads','DELETE') AS purge,
      has_table_privilege('turas_runtime','turas_environment','UPDATE') AS marker`)).rows[0];
    expect(grants).toEqual({gate:false,runtime:true,purge:false,marker:false});
  }));
  it('rejects replayed family replacement even with another protocol version', async () => withLearningDatabase(async db => {
    const id=randomUUID();await db.query(`INSERT INTO learning_cohort_families(id,environment_id,workspace_id,metric_id,quarter,state,released_at) VALUES($1,$2,$3,'deployment_lead_time','2025-Q1','released',now())`,[id,process.env.TURAS_ENVIRONMENT_ID,DEMO_IDS.workspace]);
    await db.query("UPDATE learning_cohort_families SET state='withheld',withheld_at=now(),version=version+1 WHERE id=$1",[id]);
    await expect(db.query("UPDATE learning_cohort_families SET state='released' WHERE id=$1",[id])).rejects.toMatchObject({code:'23514'});
    await expect(db.query("DELETE FROM learning_cohort_families WHERE id=$1",[id])).rejects.toMatchObject({code:'23514'});
  }));
  it('activates explicitly and cannot reverse gate history',async()=>withLearningDatabase(async db=>{
    const workspace=randomUUID();
    await db.query("INSERT INTO workspaces(id,name) VALUES($1,'Synthetic activation workspace')",[workspace]);
    await db.query('INSERT INTO learning_workspace_state(environment_id,workspace_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[process.env.TURAS_ENVIRONMENT_ID,workspace]);
    await activateLearning(process.env.TURAS_ENVIRONMENT_ID!,workspace,true,requireOwnedLearningDatabase(process.env,true));
    const first=(await db.query('SELECT gate_activated_at,enabled FROM learning_workspace_state WHERE workspace_id=$1',[workspace])).rows[0];
    expect(first.enabled).toBe(true);expect(first.gate_activated_at).toBeInstanceOf(Date);
    await activateLearning(process.env.TURAS_ENVIRONMENT_ID!,workspace,false,requireOwnedLearningDatabase(process.env,true));
    expect((await db.query('SELECT gate_activated_at,enabled FROM learning_workspace_state WHERE workspace_id=$1',[workspace])).rows[0]).toEqual({...first,enabled:false});
    await expect(db.query('UPDATE learning_workspace_state SET gate_activated_at=NULL WHERE workspace_id=$1',[workspace])).rejects.toMatchObject({code:'23514'});
  }));
  it('keeps the earliest purge deadline despite later obsolete or invalidation events',async()=>withLearningDatabase(async db=>{
    const owner=randomUUID(),at=new Date('2026-01-01T00:00:00Z'),early=new Date('2026-01-01T06:00:00Z');
    await scheduleLearningPayloadPurge(db,owner,'feedback','obsolete',at);
    await scheduleLearningPayloadPurge(db,owner,'feedback','global_invalidated',at,early);
    await scheduleLearningPayloadPurge(db,owner,'feedback','obsolete',new Date('2026-02-01T00:00:00Z'));
    expect((await db.query("SELECT purge_at FROM learning_payload_states WHERE owner_id=$1 AND kind='feedback'",[owner])).rows[0].purge_at).toEqual(early);
    await expect(db.query("UPDATE learning_payload_states SET purge_at='2026-05-01' WHERE owner_id=$1",[owner])).rejects.toMatchObject({code:'23514'});
  }));

  it('snapshots an eligible legacy head and blocks the old publication writer after activation',async()=>withLearningDatabase(async db=>{
    const actors=await learningTestActors(db),ref=await learningAcceptedOriginal(db,actors.member,actors.admin,DEMO_IDS.sharedCustomer);
    const payload={title:'Synthetic legacy practice',productVersion:'Unknown',problem:'An observed reusable engineering concern',prerequisites:'Check the current context',solution:'Measure the independently accepted result',reasoning:'Ground decisions in observed evidence',applicability:'Separately reviewed engineering contexts',limitations:'Does not establish account intent',validation:'Verify the current originals'};
    const draft=await createKnowledgeCandidate(db,actors.member,{idempotencyKey:randomUUID(),customerId:DEMO_IDS.sharedCustomer,payload,lineage:[ref]});
    await submitKnowledgeCandidate(db,actors.member,draft.id,{idempotencyKey:randomUUID(),expectedRevision:draft.revision,expectedDigest:draft.digest});
    const decision=await decideKnowledgeCandidate(db,actors.admin,draft.id,{idempotencyKey:randomUUID(),expectedRevision:draft.revision,expectedDigest:draft.digest,action:'publish',rightsAttested:true,sanitizationRationale:'Separately reviewed synthetic sanitization and rights',checklist:{namesAndDomainsRemoved:true,repositoriesAndLinksRemoved:true,peopleAndCommercialDetailsRemoved:true,identifyingConfigurationAndOutcomesRemoved:true,countsAndCombinedInferenceReviewed:true}});
    await activateLearning(process.env.TURAS_ENVIRONMENT_ID!,DEMO_IDS.workspace,false,requireOwnedLearningDatabase(process.env,true));
    const legacy=(await db.query('SELECT revision_id,publication_generation FROM learning_legacy_heads WHERE revision_id=$1',[decision.revisionId])).rows[0];
    expect(legacy.revision_id).toBe(decision.revisionId);
    await expect(db.query("UPDATE knowledge_publications SET head_generation=head_generation+1 WHERE revision_id=$1 AND state='published'",[decision.revisionId])).rejects.toMatchObject({code:'23514'});
    await expect(db.query('UPDATE learning_workspace_state SET gate_activated_at=NULL WHERE workspace_id=$1',[DEMO_IDS.workspace])).rejects.toMatchObject({code:'23514'});
  }));

  it('purges expired review prose and minimizes eligible metadata without deleting grant identity',async()=>withLearningDatabase(async db=>{
    const actors=await learningTestActors(db),original=(await db.query("SELECT r.*,c.customer_id,c.workspace_id FROM knowledge_revisions r JOIN knowledge_contributions c ON c.id=r.contribution_id WHERE c.environment_id=$1 ORDER BY r.created_at LIMIT 1",[process.env.TURAS_ENVIRONMENT_ID])).rows[0],review=randomUUID();
    await db.query(`INSERT INTO learning_candidate_reviews(id,environment_id,workspace_id,customer_id,contribution_id,revision_id,revision_number,content_digest,closure_digest,rights_digest,reviewer_membership_id,reviewer_generation,decision,created_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,$10,1,'accept',clock_timestamp()-interval '366 days')`,[review,process.env.TURAS_ENVIRONMENT_ID,original.workspace_id,original.customer_id,original.contribution_id,original.id,original.revision_number,original.content_digest,'a'.repeat(64),actors.admin.membershipId]);
    await db.query('INSERT INTO learning_review_states(review_id,revoked_at) VALUES($1,clock_timestamp())',[review]);
    await db.query('INSERT INTO learning_review_payloads(review_id,content) VALUES($1,$2)',[review,JSON.stringify({rationale:'EXPIRED_PRIVATE_REVIEW_PROSE'})]);
    await db.query('SELECT turas_learning_purge($1,100)',[process.env.TURAS_ENVIRONMENT_ID]);
    expect((await db.query('SELECT count(*)::int n FROM learning_review_payloads WHERE review_id=$1',[review])).rows[0].n).toBe(0);
    expect((await db.query('SELECT minimized,reviewer_membership_id,reviewer_generation,created_at,revision_id FROM learning_candidate_reviews WHERE id=$1',[review])).rows[0]).toEqual({minimized:true,reviewer_membership_id:null,reviewer_generation:null,created_at:null,revision_id:original.id});
    await expect(db.query('DELETE FROM learning_candidate_reviews WHERE id=$1',[review])).rejects.toMatchObject({code:'23514'});
  }));

});
