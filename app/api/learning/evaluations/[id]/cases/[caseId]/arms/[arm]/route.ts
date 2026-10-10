import {z} from 'zod';
import {learningQuery,learningRequest} from '../../../../../../_shared';
import {readLearningEvaluationCapture} from '../../../../../../../../../lib/server/learning/evaluation-captures';
import {HttpFailure} from '../../../../../../../../../lib/contracts/http';
export async function GET(request:Request,{params}:{params:Promise<{id:string;caseId:string;arm:string}>}){const {id,caseId,arm}=await params;return learningRequest(request,false,actor=>{z.object({}).strict().parse(learningQuery(request));if(arm!=='baseline'&&arm!=='candidate')throw new HttpFailure(404,'not_found','Resource not found');return readLearningEvaluationCapture(actor,id,caseId,`evaluation_${arm}`);});}
