import {z} from 'zod';
import {learningQuery,learningRequest} from '../../_shared';
import {readLearningCandidate} from '../../../../../lib/server/learning/reviews';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){const {id}=await params;return learningRequest(request,false,actor=>{z.object({}).strict().parse(learningQuery(request));return readLearningCandidate(actor,id);});}
