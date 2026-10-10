import { z } from 'zod';
import { learningRequest,learningQuery } from '../../../_shared';
import { learningId } from '../../../../../../lib/contracts/learning';
import { resolveLearningFeedbackTarget } from '../../../../../../lib/server/learning/targets';
const kindSchema=z.enum(['shared_practice','report','gap_observation','partner_guide','own_checkpoint']);
export async function GET(request:Request,context:{params:Promise<{kind:string;id:string}>}){const {kind,id}=await context.params;return learningRequest(request,false,actor=>{const query=z.object({revisionId:learningId.optional()}).strict().parse(learningQuery(request));return resolveLearningFeedbackTarget(actor,kindSchema.parse(kind),id,query.revisionId);});}
