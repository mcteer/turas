import type {CurrentSession} from '../auth/sessions';
import {learningListSchema} from '../../contracts/learning';
import {HttpFailure} from '../../contracts/http';
import {learningRead} from './commands';
import {lockInternalLearningActor,learningActorGeneration} from './policy';
import {learningWorkspaceState} from './schema';
import {getServerConfig} from '../config';
import {learningCursor,parseLearningCursor} from './cursors';
import {readKnowledgeCandidate} from '../knowledge/lineage';
import {sharedPublicationQuality} from '../knowledge/quality';
import {learningDatabaseNow} from './repository';
import {readLearningDuePage} from './refresh-handoff';
/** Separate currently authorized page summaries; no metric-family membership or omission counts. */
export async function readLearningDashboard(actor:CurrentSession,raw:unknown){
 const input=learningListSchema.parse(raw);return learningRead(actor,undefined,async db=>{
  await lockInternalLearningActor(db,actor);const state=await learningWorkspaceState(db,actor.workspaceId),at=await learningDatabaseNow(db),env=getServerConfig().TURAS_ENVIRONMENT_ID;
  const scope={kind:'health',env,workspace:actor.workspaceId,actor:actor.membershipId,session:actor.sessionId,generation:await learningActorGeneration(db,actor),search:input.search},cursor=parseLearningCursor(input.cursor,scope);
  const rows=(await db.query(`SELECT c.id,c.created_at FROM knowledge_contributions c JOIN knowledge_revisions r ON r.contribution_id=c.id AND r.revision_number=c.current_revision_number JOIN knowledge_revision_payloads p ON p.revision_id=r.id WHERE c.environment_id=$1 AND c.workspace_id=$2 AND(c.author_membership_id=$3 OR $4::boolean) AND($5::text='' OR strpos(lower(p.payload->>'title'),lower($5))>0) AND($6::timestamptz IS NULL OR(c.created_at,c.id)<($6::timestamptz,$7::uuid)) ORDER BY c.created_at DESC,c.id DESC LIMIT $8`,[env,actor.workspaceId,actor.membershipId,actor.role==='admin',input.search,cursor?.at??null,cursor?.id??null,input.limit+1])).rows;
  const evidence=[],evaluations=[];
  const operations=(await readLearningDuePage(db,actor)).map(job=>({...job,overdueSeconds:Math.max(0,Math.floor((at.getTime()-Date.parse(job.dueAt))/1000))}));
  for(const row of rows.slice(0,input.limit)){
   try{
    const candidate=await readKnowledgeCandidate(db,actor,row.id),revision=(await db.query('SELECT id FROM knowledge_revisions WHERE contribution_id=$1 AND revision_number=$2',[candidate.id,candidate.revision])).rows[0];
    if(!revision)continue;
    const originals=(await db.query(`SELECT l.source_kind,l.source_revision_id,v.observed_at,v.publication_at,v.review_at FROM knowledge_lineage l LEFT JOIN LATERAL(
     SELECT p.payload->>'observedAt' AS observed_at,NULL::text AS publication_at,p.payload->>'reviewAt' AS review_at FROM profile_revisions p WHERE l.source_kind='accepted_profile' AND p.id=l.source_revision_id
     UNION ALL SELECT r.observation_at::text,r.publication_at::text,NULL::text FROM evidence_source_revisions r WHERE l.source_kind='verified_research' AND r.id=l.source_revision_id
    ) v ON true WHERE l.revision_id=$1 ORDER BY l.ordinal LIMIT 20`,[revision.id])).rows;
    evidence.push({candidateId:candidate.id,title:candidate.payload.title,revision:candidate.revision,quality:await sharedPublicationQuality(db,revision.id,at),originalDates:originals.map(original=>({kind:original.source_kind,observationAt:original.observed_at??null,publicationAt:original.publication_at??null,reviewAt:original.review_at??null})),limitation:'Evidence quality is a review aid, not factual approval or probability. Unknown dates remain unknown.'});
    const evalRows=(await db.query(`SELECT e.id,e.state,e.revision_id,e.deadline_at,(SELECT count(*)::int FROM learning_bindings b JOIN learning_attempts a ON a.binding_id=b.id WHERE b.evaluation_id=e.id AND a.state='completed') AS completed_arms,(SELECT count(*)::int FROM learning_case_reviews r WHERE r.evaluation_id=e.id) AS reviewed_cases FROM learning_evaluations e WHERE e.environment_id=$1 AND e.workspace_id=$2 AND e.contribution_id=$3 ORDER BY e.created_at DESC,e.id DESC LIMIT 1`,[env,actor.workspaceId,candidate.id])).rows;
    if(evalRows[0]){const evaluation=evalRows[0];evaluations.push({candidateId:candidate.id,evaluationId:String(evaluation.id),state:String(evaluation.state),requiredPairs:8,requiredArms:16,completedArms:Number(evaluation.completed_arms),reviewedCases:Number(evaluation.reviewed_cases),exactCurrentRevision:evaluation.revision_id===revision.id,limitation:'Open the exact evaluation to recheck current release eligibility.'});}

   }catch(error){if(!(error instanceof HttpFailure)||error.status>=500)throw error;}
  }
  const last=rows.slice(0,input.limit).at(-1);
  return {contractVersion:'learning-v1' as const,enabled:state.enabled,activated:!!state.activatedAt,asOf:at.toISOString(),evidence,evaluations,operations,scope:'Evidence and evaluations cover this authorized practice page. Due reviews include authorized practice and measurement work; aggregate families are separate.',cursor:rows.length>input.limit&&last?learningCursor(scope,last.created_at,last.id):null};
 });
}
