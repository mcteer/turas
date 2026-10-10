import {learningQuery,learningRequest} from '../_shared';
import {readLearningCohort} from '../../../../lib/server/learning/cohorts';
export async function GET(request:Request){return learningRequest(request,false,actor=>readLearningCohort(actor,learningQuery(request)));}
