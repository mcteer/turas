import { z } from 'zod';
import { learningQuery,learningRequest } from '../../_shared';
import { readLearningRequest } from '../../../../../lib/server/learning/commands';
export async function GET(request:Request,{params}:{params:Promise<{requestId:string}>}){return learningRequest(request,false,async actor=>{z.object({}).strict().parse(learningQuery(request));return readLearningRequest(actor,(await params).requestId);});}
