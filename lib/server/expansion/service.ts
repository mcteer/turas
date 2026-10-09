import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {HttpFailure,hiddenRecord} from '../../contracts/http';
import {validateExpansionReviewDate} from '../../contracts/expansion';
import {withTransaction} from '../db/client';
import {getServerConfig} from '../config';
import {lockExpansionActor,validateExpansionMembers,requireExpansionEnvironment,type ExpansionActor} from './policy';
import {expansionScope,incrementExpansionScope} from './repository';
import {expansionCommandSchema,type ExpansionSaveCommand} from './schema';
import {expansionHash,expansionOpaqueHashes,expansionReceipt,lockExpansionCommandKey,saveExpansionReceipt,admitExpansionCommand,type ExpansionReceipt} from './commands';
import {verifyExpansionSources,validateExpansionAssertions} from './sources';
import {canonicalExpansionProduct,expansionProductVocabularyVersion} from '../../expansion/products';
export async function expansionTransaction<T>(run:(db:PoolClient)=>Promise<T>):Promise<T>{
 for(let attempt=0;;attempt++){try{return await withTransaction(run);}catch(error){if(attempt>=2||!['40001','40P01'].includes(String((error as {code?:unknown}).code)))throw error;}}
}
export async function saveExpansionProposal(actor:ExpansionActor,customerId:string,raw:unknown):Promise<ExpansionReceipt>{
 const command=expansionCommandSchema.parse(raw);if(command.operation!=='save_hypothesis')throw new HttpFailure(422,'unsupported_action','Use the exact expansion workflow');
 await admitExpansionCommand(actor,customerId,command.requestKey,expansionHash({customerId,command}));
 return expansionTransaction(db=>saveExpansionRevision(db,actor,customerId,command));
}
export async function saveExpansionRevision(db:PoolClient,actor:ExpansionActor,customerId:string,command:ExpansionSaveCommand,identity?:{digest:string;operation:'save_suggestion';attemptId:string;outputDigest:string;suggestionIndex:number}){
 const owners=[...(command.content.nextStep.owner.kind==='membership'?[command.content.nextStep.owner.membershipId]:[]),...command.content.prerequisites.flatMap(p=>p.ownerMembershipId?[p.ownerMembershipId]:[])];
 await lockExpansionActor(db,actor,customerId,owners,false);await lockExpansionCommandKey(db,actor,command.requestKey);
 const digest=identity?.digest??expansionHash({customerId,command}),prior=await expansionReceipt(db,actor,customerId,command.requestKey,digest);if(prior)return prior;
 await requireExpansionEnvironment(db,true);await validateExpansionMembers(db,actor,owners);
 if(!validateExpansionReviewDate(command.content.nextReviewDate))throw new HttpFailure(422,'invalid_date','Choose a next review from today through 366 days ahead');
 const product=canonicalExpansionProduct(command.content.productKey);if(product.key!==command.content.productKey)throw new HttpFailure(422,'noncanonical_product','Choose the canonical product identity');
 const sources=await verifyExpansionSources(db,actor,customerId,command.workloadId,command.selectedEngagementIds,command.sourceRefs,true,command.deliveryLinks);
 await validateExpansionAssertions(db,actor,customerId,command.content,command.sourceRefs);
 const scope=await expansionScope(db,actor,customerId,command.workloadId,{create:true,lock:true});if(!scope)throw hiddenRecord();
 const duplicateHashes=expansionOpaqueHashes(['duplicate',getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,scope.id,product.key,command.content.problemKey]);
 let recordId=command.recordId,ordinal=1;
 if(recordId){
  const row=(await db.query('SELECT * FROM expansion_hypotheses WHERE id=$1 AND scope_id=$2 FOR UPDATE',[recordId,scope.id])).rows[0];if(!row)throw hiddenRecord();
  if(Number(row.version)!==command.expectedVersion)throw new HttpFailure(409,'version_conflict','Hypothesis changed; refresh before saving');
  if(row.product_key!==product.key||!duplicateHashes.includes(row.duplicate_key))throw new HttpFailure(409,'identity_conflict','Product/problem identity is immutable; create a related hypothesis');
  ordinal=Number((await db.query('SELECT COALESCE(max(revision_number),0)+1 AS ordinal FROM expansion_revisions WHERE record_id=$1',[recordId])).rows[0].ordinal);
 }else{
  if(scope.generation!==command.expectedVersion)throw new HttpFailure(409,'version_conflict','Expansion scope changed; refresh before creating');
  const related=(await db.query('SELECT id,version,disposition FROM expansion_hypotheses WHERE scope_id=$1 AND duplicate_key=ANY($2::text[]) ORDER BY id',[scope.id,duplicateHashes])).rows;
  if(related.length){const relatedSetDigest=expansionHash(related);if(command.duplicateAcknowledgement?.relatedSetDigest!==relatedSetDigest)throw new HttpFailure(409,'duplicate_hypothesis','Review Related Hypotheses and acknowledge a distinct proposal');}
  recordId=randomUUID();await db.query('INSERT INTO expansion_hypotheses(id,scope_id,environment_id,workspace_id,customer_id,creator_membership_id,product_key,duplicate_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[recordId,scope.id,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,customerId,actor.membershipId,product.key,duplicateHashes[0]]);
 }
 const revisionId=randomUUID(),contentDigest=expansionHash(command.content);
 if(identity){await db.query('INSERT INTO expansion_revisions(id,record_id,scope_id,revision_number,author_membership_id,content_digest,source_digest,vocabulary_version,ranking_version,advice_attempt_id,advice_output_digest,advice_suggestion_index) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',[revisionId,recordId,scope.id,ordinal,actor.membershipId,contentDigest,sources.digest,expansionProductVocabularyVersion,'expansion-ranking-v1',identity?.attemptId??null,identity?.outputDigest??null,identity?.suggestionIndex??null]);}else{await db.query('INSERT INTO expansion_revisions(id,record_id,scope_id,revision_number,author_membership_id,content_digest,source_digest,vocabulary_version,ranking_version) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[revisionId,recordId,scope.id,ordinal,actor.membershipId,contentDigest,sources.digest,expansionProductVocabularyVersion,'expansion-ranking-v1']);}
 const refs=command.sourceRefs.map(ref=>{const{citationId:_,...original}=ref as typeof ref&{citationId?:string};return original;});
 await db.query('INSERT INTO expansion_payloads(id,revision_id,content) VALUES($1,$2,$3)',[randomUUID(),revisionId,{content:command.content,sourceRefs:refs,selectedEngagementIds:command.selectedEngagementIds,deliveryLinks:command.deliveryLinks,duplicateAcknowledgement:command.duplicateAcknowledgement??null}]);
 for(const source of sources.dependencies)await db.query('INSERT INTO expansion_dependencies(id,revision_id,source_kind,source_revision_id,generation,content_digest) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),revisionId,source.kind,source.revisionId,source.generation,source.contentDigest]);
 const row=(await db.query('UPDATE expansion_hypotheses SET working_revision_id=$2,version=version+1 WHERE id=$1 RETURNING version',[recordId,revisionId])).rows[0];await incrementExpansionScope(db,scope.id);
 return saveExpansionReceipt(db,actor,customerId,command.requestKey,digest,{operation:identity?.operation??command.operation,recordId,revisionId,decisionId:null,outcome:'proposed',version:Number(row.version)});
}
