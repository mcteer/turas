import { learningRequest } from '../../../_shared';
import { saveLearningDraft } from '../../../../../../lib/server/learning/drafts';
import { learningLimits } from '../../../../../../lib/contracts/learning';
export async function POST(request:Request,context:{params:Promise<{id:string}>}){const {id}=await context.params;return learningRequest(request,true,(actor,body)=>saveLearningDraft(actor,id,body),learningLimits.inputBytes);}
