import { learningRequest } from '../../../_shared';
import { cancelLearningDraft } from '../../../../../../lib/server/learning/advisory';
export async function POST(request:Request,context:{params:Promise<{id:string}>}){const {id}=await context.params;return learningRequest(request,true,(actor,body)=>cancelLearningDraft(actor,id,body));}
