import {createHash,randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {Client} from 'pg';
import type {PilotHostedScope} from '../lib/contracts/pilot-hosted';
import {staffingCreateResourceSchema,staffingCreateSkillSchema} from '../lib/contracts/staffing';
import {workforceImportIntentSchema,workforceImportCompletionSchema,workforceMappingSchema,workforceReviewSchema} from '../lib/contracts/staffing-imports';
/** One controlled synthetic personnel original. Its private cells never become
 * customer retrieval, shared knowledge, delivery acceptance or certification. */
export async function runSyntheticWorkforceRecipe(input:{scope:PilotHostedScope;db:Client;signal:AbortSignal;request:(path:string,method:'GET'|'POST',body?:unknown)=>Promise<unknown>;uploadOriginal:(importId:string,bytes:Buffer)=>Promise<void>;runQueuedImport:(sourceVersionId:string,importId:string)=>Promise<void>;readOriginal:(importId:string,expected:Buffer)=>Promise<void>}){
 const {scope,db,request,signal}=input;
 const workspace=(await db.query("SELECT id FROM workspaces WHERE id=$1 AND active AND classification='synthetic_pilot' AND pilot_environment_id=$2",[scope.workspaceId,scope.environmentMarker])).rows;
 if(workspace.length!==1)throw Error('Exact synthetic workforce workspace required');
 const unwrap=(value:unknown)=>z.object({data:z.unknown()}).parse(value).data;
 async function command(path:string,body:{requestKey:string;[key:string]:unknown}){
  signal.throwIfAborted();try{return unwrap(await request(path,'POST',body));}catch(error){await request('/api/staffing/commands/'+body.requestKey,'GET').catch(()=>undefined);throw error;}
 }
 const resource=z.object({resourceId:z.uuid()}).parse(await command('/api/staffing/resources',staffingCreateResourceSchema.parse({requestKey:randomUUID(),rationale:'Controlled synthetic workforce validation only',resource:{displayName:'Synthetic pilot engineer',externalKey:'synthetic_'+randomUUID(),kind:'internal',state:'active',membershipId:null,partnerOrganizationId:null,timezone:'UTC',regionCode:'US'}})));
 const skill=z.object({skillId:z.uuid()}).parse(await command('/api/staffing/skills',staffingCreateSkillSchema.parse({requestKey:randomUUID(),rationale:'Controlled synthetic skill definition only',skill:{key:'synthetic_'+randomUUID().replaceAll('-',''),name:'Synthetic delivery review',definition:'Review a controlled synthetic delivery workflow',state:'active'}})));
 const today=new Date().toISOString().slice(0,10),reviewDate=new Date(Date.now()+30*86400000).toISOString().slice(0,10);
 const bytes=Buffer.from('resource,skill,level,assessment,review,evidence\nexact-resource,exact-skill,3,'+today+','+reviewDate+',PRIVATE_SYNTHETIC_PILOT_PERSONNEL_EVIDENCE\n'),digest=createHash('sha256').update(bytes).digest('hex');
 const intent=z.object({importId:z.uuid(),sourceId:z.uuid(),generation:z.literal(1)}).parse(await command('/api/staffing/imports',workforceImportIntentSchema.parse({requestKey:randomUUID(),filename:'synthetic-pilot-workforce.csv',format:'csv',byteSize:bytes.length,contentDigest:digest})));
 await input.uploadOriginal(intent.importId,bytes);
 const complete=z.object({sourceVersionId:z.uuid(),generation:z.literal(1)}).parse(await command('/api/staffing/imports/'+intent.importId+'/complete',workforceImportCompletionSchema.parse({requestKey:randomUUID(),contentDigest:digest,sourceGeneration:1})));
 await input.runQueuedImport(complete.sourceVersionId,intent.importId);await input.readOriginal(intent.importId,bytes);
 const view=z.object({importId:z.uuid(),sourceVersionId:z.uuid(),withheld:z.literal(false),extraction:z.object({extractionRunId:z.uuid(),contentDigest:z.string().regex(/^[a-f0-9]{64}$/),complete:z.literal(true),coverage:z.object({total:z.number().int(),visited:z.number().int(),omitted:z.array(z.unknown()).length(0)})})}).parse(unwrap(await request('/api/staffing/imports/'+intent.importId,'GET')));
 if(view.importId!==intent.importId||view.sourceVersionId!==complete.sourceVersionId||view.extraction.coverage.total!==view.extraction.coverage.visited)throw Error('Actual complete exact workforce extraction required');
 const mapped=z.object({state:z.literal('mapped'),revisionId:z.uuid()}).parse(await command('/api/staffing/imports/'+intent.importId+'/mappings',workforceMappingSchema.parse({requestKey:randomUUID(),sourceVersionId:complete.sourceVersionId,sourceGeneration:1,extractionRunId:view.extraction.extractionRunId,extractionDigest:view.extraction.contentDigest,csvDateConvention:'ISO',tables:[{sheetIndex:0,startRow:1,headerRow:1,endRow:2,startColumn:1,endColumn:6,columns:{resource:1,skill:2,level:3,assessmentDate:4,nextReviewDate:5,evidence:6}}],resources:[{value:'exact-resource',resourceId:resource.resourceId}],skills:[{value:'exact-skill',skillId:skill.skillId}],corrections:[]})));
 const candidates=(await db.query('SELECT c.id,c.aggregate_version,v.id AS revision_id,v.content_digest,p.locators FROM workforce_competencies c JOIN workforce_competency_revisions v ON v.id=c.current_pending_revision_id JOIN workforce_competency_payloads p ON p.revision_id=v.id WHERE c.workspace_id=$1 AND c.resource_id=$2 AND c.skill_id=$3 AND v.source_version_id=$4',[scope.workspaceId,resource.resourceId,skill.skillId,complete.sourceVersionId])).rows;
 if(candidates.length!==1||candidates[0].locators.length!==6||candidates[0].locators.some((row:{cellId?:string})=>!row.cellId)||new Set(candidates[0].locators.map((row:{cellId:string})=>row.cellId)).size!==6)throw Error('Six exact normal workforce cell identities required');
 const candidate=candidates[0];
 await command('/api/staffing/competency-decisions',workforceReviewSchema.parse({requestKey:randomUUID(),rows:[{competencyId:candidate.id,candidateRevisionId:candidate.revision_id,candidateDigest:candidate.content_digest,expectedAggregateVersion:Number(candidate.aggregate_version),sourceGeneration:1,action:'accept',rationale:'Exact operator review of controlled synthetic original cells and explicit resource/skill mapping'}]}));
 const accepted=(await db.query('SELECT current_accepted_revision_id FROM workforce_competencies WHERE id=$1 AND workspace_id=$2',[candidate.id,scope.workspaceId])).rows;
 if(accepted.length!==1||accepted[0].current_accepted_revision_id!==candidate.revision_id)throw Error('Ordinary exact workforce review incomplete');
 const jobs=(await db.query('SELECT id FROM workforce_import_jobs WHERE source_version_id=$1 AND environment_id=$2',[complete.sourceVersionId,scope.environmentMarker])).rows;
 if(jobs.length!==1)throw Error('Exact ordinary workforce job required');
 return {contract:'pilot-synthetic-workforce-recipe-v1',journey:'J007',resourceId:resource.resourceId,skillId:skill.skillId,importId:intent.importId,sourceId:intent.sourceId,sourceVersionId:complete.sourceVersionId,jobId:jobs[0].id,extractionRunId:view.extraction.extractionRunId,mappingRevisionId:mapped.revisionId,competencyId:candidate.id,competencyRevisionId:candidate.revision_id,originalBytesVerified:true,locatedCells:6,normalCommands:6,modelCalls:0,staffingCommitmentVerified:false,skillsCertified:false,fullWorkforceJourneyVerified:false};
}
