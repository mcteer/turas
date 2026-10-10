import {learningRequest} from '../../../_shared';
import {reviewLearningSettlement} from '../../../../../../lib/server/learning/budget';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){const {id}=await params;return learningRequest(request,true,(actor,body)=>reviewLearningSettlement(actor,id,body));}
