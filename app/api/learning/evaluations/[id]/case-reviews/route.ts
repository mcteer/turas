import {learningRequest} from '../../../_shared';
import {reviewLearningEvaluationCase} from '../../../../../../lib/server/learning/evaluation-review';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){const {id}=await params;return learningRequest(request,true,(actor,body)=>reviewLearningEvaluationCase(actor,id,body));}
