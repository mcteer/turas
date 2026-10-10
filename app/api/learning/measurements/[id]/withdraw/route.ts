import {learningRequest} from '../../../_shared';
import {withdrawLearningMeasurement} from '../../../../../../lib/server/learning/measurements';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){const {id}=await params;return learningRequest(request,true,(actor,body)=>withdrawLearningMeasurement(actor,id,body));}
