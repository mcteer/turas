import { learningRequest } from '../../../_shared';
import { reviseLearningFeedback } from '../../../../../../lib/server/learning/feedback';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){return learningRequest(request,true,async(actor,body)=>reviseLearningFeedback(actor,(await params).id,body));}
