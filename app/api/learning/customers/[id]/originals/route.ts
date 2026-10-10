import { learningRequest,learningQuery } from '../../../_shared';
import { listLearningOriginals } from '../../../../../../lib/server/learning/catalog';
export async function GET(request:Request,context:{params:Promise<{id:string}>}){const {id}=await context.params;return learningRequest(request,false,actor=>listLearningOriginals(actor,id,learningQuery(request)));}
