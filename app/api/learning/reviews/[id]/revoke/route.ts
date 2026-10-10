import {learningRequest} from '../../../_shared';
import {revokeLearningReview} from '../../../../../../lib/server/learning/reviews';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){const {id}=await params;return learningRequest(request,true,(actor,body)=>revokeLearningReview(actor,id,body));}
