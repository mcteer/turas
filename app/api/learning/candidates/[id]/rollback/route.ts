import {learningRequest} from '../../../_shared';
import {prepareLearningRollback} from '../../../../../../lib/server/learning/rollback';
import {learningLimits} from '../../../../../../lib/contracts/learning';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){const {id}=await params;return learningRequest(request,true,(actor,body)=>prepareLearningRollback(actor,id,body),learningLimits.inputBytes);}
