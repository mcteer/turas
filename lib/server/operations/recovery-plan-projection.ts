import {z} from 'zod';
import {buildStoredPlanContent,planDraftContentSchema} from '../../contracts/plan-content';
import {planSha256} from '../../contracts/plans';
import {recoveryDigest} from '../../contracts/pilot-recovery';
const projection=z.object({planId:z.uuid(),customerId:z.uuid(),revisionId:z.uuid(),acceptedRevisionId:z.uuid(),aggregateVersion:z.number().int().positive(),contentDigest:z.string().regex(/^[a-f0-9]{64}$/),reviewState:z.literal('accepted'),contentAvailability:z.literal('readable'),reviewRequired:z.literal(false),content:z.record(z.string(),z.unknown())});
/** Positive accepted-content coverage requires readable, canonical stored bytes.
 * Matching withheld responses cannot establish service restoration. */
export function acceptedPlanRecoveryDigest(value:unknown,expected:{planId:string;customerId:string;revisionId:string;generation:string}){
 const plan=projection.parse(value);
 if(plan.planId!==expected.planId||plan.customerId!==expected.customerId||plan.revisionId!==expected.revisionId||plan.acceptedRevisionId!==expected.revisionId||String(plan.aggregateVersion)!==expected.generation)throw Error('Maintenance accepted plan identity or generation differs');
 const sections=z.array(z.record(z.string(),z.unknown())).parse(plan.content.sections);
 const draft=planDraftContentSchema.parse({...plan.content,sections:sections.filter(section=>!['evidence','decision'].includes(String(section.key)))});
 if(planSha256(plan.content)!==plan.contentDigest||planSha256(buildStoredPlanContent(draft))!==plan.contentDigest)throw Error('Maintenance accepted plan stored content differs');
 return recoveryDigest(plan);
}
