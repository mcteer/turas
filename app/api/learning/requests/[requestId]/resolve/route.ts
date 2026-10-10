import { z } from 'zod';
import { learningRequest } from '../../../_shared';
import { learningId } from '../../../../../../lib/contracts/learning';
import { HttpFailure } from '../../../../../../lib/contracts/http';
import { readLearningRequest } from '../../../../../../lib/server/learning/commands';
const resolve=z.object({contractVersion:z.literal('learning-v1'),requestId:learningId,expectedVersion:z.literal(0),action:z.enum(['reconcile','abandon'])}).strict();
export async function POST(request:Request,{params}:{params:Promise<{requestId:string}>}){return learningRequest(request,true,async(actor,body)=>{const input=resolve.parse(body),id=(await params).requestId;if(input.requestId!==id)throw new HttpFailure(422,'invalid_input','Request identity mismatch');return readLearningRequest(actor,id,input.action==='abandon');});}
