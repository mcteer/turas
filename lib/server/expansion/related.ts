import {z} from 'zod';
import {expansionId,expansionProductKey,expansionProblemKey,expansionVersion,expansionDigest,expansionDisposition} from '../../contracts/expansion';
import {canonicalExpansionProduct} from '../../expansion/products';
import {HttpFailure} from '../../contracts/http';
import {getServerConfig} from '../config';
import {withTransaction} from '../db/client';
import {lockExpansionActor,type ExpansionActor} from './policy';
import {expansionScope} from './repository';
import {admitExpansionRequest,expansionOpaqueHashes,expansionHash} from './commands';
import {readExpansionRevision} from './projection';
import {expansionOutput} from './projection-schema';
export const expansionRelatedQuerySchema=z.object({workloadId:expansionId.optional(),productKey:expansionProductKey,problemKey:expansionProblemKey}).strict();
export const expansionRelatedProjectionSchema=z.object({relatedSetDigest:expansionDigest,records:z.array(z.object({id:expansionId,version:expansionVersion,disposition:expansionDisposition,title:z.string().min(1).max(200).nullable()}).strict()).max(50)}).strict();
export async function readExpansionRelated(actor:ExpansionActor,customerId:string,raw:unknown){
 const input=expansionRelatedQuerySchema.parse(raw);await admitExpansionRequest(actor,customerId,'read');
 return withTransaction(async db=>{
  await lockExpansionActor(db,actor,customerId);const workloadId=input.workloadId??null,scope=await expansionScope(db,actor,customerId,workloadId);
  const product=canonicalExpansionProduct(input.productKey);if(product.key!==input.productKey)throw new HttpFailure(422,'noncanonical_product','Choose the canonical product identity');
  if(!scope)return expansionOutput(expansionRelatedProjectionSchema,{relatedSetDigest:expansionHash([]),records:[]});
  const hashes=expansionOpaqueHashes(['duplicate',getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,scope.id,product.key,input.problemKey]);
  const related=(await db.query('SELECT id,version,disposition,working_revision_id FROM expansion_hypotheses WHERE scope_id=$1 AND duplicate_key=ANY($2::text[]) ORDER BY id',[scope.id,hashes])).rows;
  if(related.length>50)throw new HttpFailure(422,'scope_too_large','Too many related hypotheses for a safe comparison');
  const records=[];
  for(const record of related){const working=await readExpansionRevision(db,actor,customerId,workloadId,record.working_revision_id,true,true);records.push({id:record.id,version:Number(record.version),disposition:record.disposition,title:working.payload?.content.title??null});}
  const final=await expansionScope(db,actor,customerId,workloadId,{lock:true});if(final?.generation!==scope.generation)throw new HttpFailure(409,'related_changed','Related hypotheses changed; refresh the comparison');
  return expansionOutput(expansionRelatedProjectionSchema,{relatedSetDigest:expansionHash(related.map(({id,version,disposition})=>({id,version,disposition}))),records});
 });
}
