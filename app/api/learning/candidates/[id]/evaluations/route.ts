import {learningRequest} from '../../../_shared';
import {prepareLearningEvaluation} from '../../../../../../lib/server/learning/evaluation';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){const {id}=await params;return learningRequest(request,true,(actor,body)=>prepareLearningEvaluation(actor,body,id));}
