import {learningRequest} from '../../../_shared';
import {reviewLearningCandidate} from '../../../../../../lib/server/learning/reviews';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){const {id}=await params;return learningRequest(request,true,(actor,body)=>reviewLearningCandidate(actor,id,body));}
