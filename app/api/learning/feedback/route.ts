import { learningQuery,learningRequest } from '../_shared';
import { createLearningFeedback,listLearningFeedback } from '../../../../lib/server/learning/feedback';
export async function GET(request:Request){return learningRequest(request,false,actor=>listLearningFeedback(actor,learningQuery(request)));}
export async function POST(request:Request){return learningRequest(request,true,(actor,body)=>createLearningFeedback(actor,body));}
