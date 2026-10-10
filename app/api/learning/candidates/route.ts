import {learningQuery,learningRequest} from '../_shared';
import {listLearningCandidates} from '../../../../lib/server/learning/reviews';
export async function GET(request:Request){return learningRequest(request,false,actor=>listLearningCandidates(actor,learningQuery(request)));}
