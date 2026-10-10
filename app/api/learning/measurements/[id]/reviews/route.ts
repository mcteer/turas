import {learningRequest} from '../../../_shared';
import {reviewLearningMeasurement} from '../../../../../../lib/server/learning/measurements';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){const {id}=await params;return learningRequest(request,true,(actor,body)=>reviewLearningMeasurement(actor,id,body));}
