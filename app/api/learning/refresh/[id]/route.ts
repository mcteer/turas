import {z} from 'zod';
import {learningRequest,learningQuery} from '../../_shared';
import {readLearningRefreshHandoff} from '../../../../../lib/server/learning/refresh-handoff';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){return learningRequest(request,false,async actor=>{z.object({}).strict().parse(learningQuery(request));return readLearningRefreshHandoff(actor,(await params).id);});}
