import {learningRequest} from '../../../_shared';
import {reviseLearningMeasurement} from '../../../../../../lib/server/learning/measurements';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){const {id}=await params;return learningRequest(request,true,(actor,body)=>reviseLearningMeasurement(actor,id,body),131072);}
