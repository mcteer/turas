import {z} from 'zod';
import {learningQuery,learningRequest} from '../../../../_shared';
import {readLearningCandidateOriginal} from '../../../../../../../lib/server/learning/reviews';
export async function GET(request:Request,{params}:{params:Promise<{id:string;sourceId:string}>}){const {id,sourceId}=await params;return learningRequest(request,false,actor=>{z.object({}).strict().parse(learningQuery(request));return readLearningCandidateOriginal(actor,id,sourceId);});}
