import {learningQuery,learningRequest} from '../_shared';
import {readLearningDashboard} from '../../../../lib/server/learning/dashboard';
export async function GET(request:Request){return learningRequest(request,false,actor=>readLearningDashboard(actor,learningQuery(request)));}
