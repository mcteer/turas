import {learningRequest} from '../../_shared';
import {releaseLearningCohort} from '../../../../../lib/server/learning/cohorts';
export async function POST(request:Request){return learningRequest(request,true,(actor,body)=>releaseLearningCohort(actor,body));}
