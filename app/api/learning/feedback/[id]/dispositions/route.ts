import { learningRequest } from '../../../_shared';
import { disposeLearningFeedback } from '../../../../../../lib/server/learning/feedback';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){return learningRequest(request,true,async(actor,body)=>disposeLearningFeedback(actor,(await params).id,body));}
