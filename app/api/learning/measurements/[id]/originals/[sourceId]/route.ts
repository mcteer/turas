import {z} from 'zod';
import {learningQuery,learningRequest} from '../../../../_shared';
import {readLearningMeasurementOriginal} from '../../../../../../../lib/server/learning/measurements';
export async function GET(request:Request,{params}:{params:Promise<{id:string;sourceId:string}>}){const {id,sourceId}=await params;return learningRequest(request,false,actor=>{z.object({}).strict().parse(learningQuery(request));return readLearningMeasurementOriginal(actor,id,sourceId);});}
