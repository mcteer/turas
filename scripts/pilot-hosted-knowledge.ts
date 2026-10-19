import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {Client} from 'pg';
import type {PilotHostedScope} from '../lib/contracts/pilot-hosted';
import {knowledgeCandidateSchema,knowledgeDecisionSchema,publishedKnowledgeSchema} from '../lib/contracts/knowledge';
/** An ordinary reviewed baseline before first learning activation. Never turns
 * learning off, fabricates an evaluation or bypasses an activated release gate. */
export async function runHostedKnowledgeBaseline(input:{scope:PilotHostedScope;db:Client;customerId:string;sourceRevisionId:string;request:(path:string,method:'GET'|'POST',body?:unknown)=>Promise<unknown>;authorRequest?:(path:string,method:'GET'|'POST',body?:unknown)=>Promise<unknown>;signal:AbortSignal}){
 const {scope,db,request,signal}=input,author=input.authorRequest??request;signal.throwIfAborted();
 const rows=(await db.query("SELECT l.enabled,l.gate_activated_at,l.version FROM learning_workspace_state l JOIN workspaces w ON w.id=l.workspace_id AND w.active AND w.classification='synthetic_pilot' AND w.pilot_environment_id=l.environment_id JOIN customer_references c ON c.workspace_id=w.id AND c.id=$3 AND c.synthetic WHERE l.environment_id=$1 AND l.workspace_id=$2",[scope.environmentMarker,scope.workspaceId,input.customerId])).rows;
 if(rows.length!==1||rows[0].enabled||rows[0].gate_activated_at||Number(rows[0].version)!==1)throw Error('Exact never-activated synthetic learning baseline required');
 const unwrap=(value:unknown)=>z.object({data:z.unknown()}).parse(value).data;
 const options=z.array(z.object({sourceKind:z.literal('accepted_profile'),sourceRevisionId:z.uuid(),sourceGeneration:z.number().int().positive(),sourceDigest:z.string().regex(/^[a-f0-9]{64}$/)})).max(50).parse(unwrap(await author('/api/knowledge/sources?customerId='+input.customerId,'GET')));
 const source=options.find(row=>row.sourceRevisionId===input.sourceRevisionId);if(!source)throw Error('Ordinarily accepted exact baseline source unavailable');
 const payload={title:'Controlled synthetic baseline '+randomUUID().slice(0,8),productVersion:'Unknown',problem:'A reviewed workload needs an explicit measurement boundary',prerequisites:'Current accepted workload evidence and a responsible delivery owner',solution:'Agree on the measurement boundary and retain observations for exact review',reasoning:'An explicit boundary makes the observations interpretable',applicability:'Workloads with current independently reviewed context',limitations:'This synthetic example establishes no actual customer outcome or causality',validation:'Review the original observations, scope and missing information'};
 const created=z.object({id:z.uuid(),revision:z.number().int().positive(),digest:z.string().regex(/^[a-f0-9]{64}$/),state:z.literal('draft')}).parse(unwrap(await author('/api/knowledge/contributions','POST',knowledgeCandidateSchema.parse({idempotencyKey:randomUUID(),customerId:input.customerId,payload,lineage:[{...source,rightsBasis:'Operator-controlled synthetic original with explicit synthetic reuse rights'}]}))));
 const envelope={idempotencyKey:randomUUID(),expectedRevision:created.revision,expectedDigest:created.digest};
 await author('/api/knowledge/contributions/'+created.id+'/submit','POST',envelope);
 const published=z.object({action:z.literal('publish'),revisionId:z.uuid()}).parse(unwrap(await request('/api/knowledge/contributions/'+created.id+'/decisions','POST',knowledgeDecisionSchema.parse({...envelope,idempotencyKey:randomUUID(),action:'publish',rightsAttested:true,sanitizationRationale:'Generic synthetic practice only; no customer identities, configuration or outcomes',checklist:{namesAndDomainsRemoved:true,repositoriesAndLinksRemoved:true,peopleAndCommercialDetailsRemoved:true,identifyingConfigurationAndOutcomesRemoved:true,countsAndCombinedInferenceReviewed:true}}))));
 const headers=(await db.query("SELECT id FROM knowledge_publications WHERE environment_id=$1 AND contribution_id=$2 AND revision_id=$3 AND state='published'",[scope.environmentMarker,created.id,published.revisionId])).rows;
 if(headers.length!==1)throw Error('Exact ordinarily reviewed baseline publication required');
 const read=publishedKnowledgeSchema.parse(unwrap(await request('/api/knowledge/'+headers[0].id,'GET')));
 if(read.id!==headers[0].id||read.payload.title!==payload.title||read.caveats.length)throw Error('Actual baseline read differs');
 return {contract:'pilot-hosted-knowledge-baseline-v1',journey:'J005',contributionId:created.id,revisionId:published.revisionId,publicationId:read.id,normalCommands:3,providerCalls:0,preActivationBaseline:true,pairedEvaluationVerified:false,fullLearningJourneyVerified:false};
}
