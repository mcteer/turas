import { learningRequest } from '../_shared';
import { prepareLearningDraft } from '../../../../lib/server/learning/advisory';
import { learningLimits } from '../../../../lib/contracts/learning';
export async function POST(request:Request){return learningRequest(request,true,(actor,body)=>prepareLearningDraft(actor,body),learningLimits.inputBytes);}
