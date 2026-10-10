import { z } from 'zod';
import { learningQuery,learningRequest } from '../../_shared';
import { readLearningFeedback } from '../../../../../lib/server/learning/feedback';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){return learningRequest(request,false,async actor=>{z.object({}).strict().parse(learningQuery(request));return readLearningFeedback(actor,(await params).id);});}
