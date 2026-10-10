import {learningRequest} from '../../../_shared';
import {cancelLearningEvaluation} from '../../../../../../lib/server/learning/evaluation';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){const {id}=await params;return learningRequest(request,true,(actor,body)=>cancelLearningEvaluation(actor,id,body));}
