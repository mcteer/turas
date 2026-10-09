import {randomUUID} from 'node:crypto';
import type {CurrentSession} from '../../../lib/server/auth/sessions';
import type {ExpansionHypothesis} from '../../../lib/contracts/expansion';
import {createReviewedPlanWorkload} from '../plans/journey';
import {withExpansionDatabase} from './environment';
import {acceptedExpansionEvidence} from './evidence';
import {discoveryHypothesis} from './index';
import {saveExpansionProposal} from '../../../lib/server/expansion/service';
import {readExpansionWorkspace} from '../../../lib/server/expansion/projection';
export async function supportedExpansionProposal(author:CurrentSession,reviewer:CurrentSession,customerId:string){
 const workload=await withExpansionDatabase(db=>createReviewedPlanWorkload(db,author,reviewer,customerId));
 const need=await acceptedExpansionEvidence(author,reviewer,customerId,workload,'Synthetic accepted need for lower response latency.',`synthetic-operating-${randomUUID()}`,'adoption_process');
 const product=await acceptedExpansionEvidence(author,reviewer,customerId,workload,'Synthetic exact fresh capability supports a reversible latency experiment.',`synthetic-capability-${randomUUID()}`,'product_capability');
 const content:ExpansionHypothesis={...discoveryHypothesis(),title:'Synthetic supported expansion hypothesis',productKey:`synthetic-potential-${randomUUID()}`,benefit:{kind:'qualitative_outcome',rationale:'Proposed latency improvement',validationCriterion:'Customer operating owner validates measured request latency'},
  assertions:[{purpose:'customer_need',classification:'accepted_fact',text:'Synthetic accepted need for lower response latency.',sourceKeys:[need.reference.id]},
   {purpose:'product_suitability',classification:'accepted_fact',text:'Synthetic exact fresh capability supports a reversible latency experiment.',sourceKeys:[product.reference.id]}]};
 const sourceRefs=[need.reference,product.reference],scope=await readExpansionWorkspace(author,customerId,{});
 const command={contractVersion:'expansion-v1' as const,operation:'save_hypothesis' as const,requestKey:randomUUID(),workloadId:null,expectedVersion:scope.scopeGeneration,content,sourceRefs,selectedEngagementIds:[],deliveryLinks:[]};
 return {saved:await saveExpansionProposal(author,customerId,command),command,need};
}
