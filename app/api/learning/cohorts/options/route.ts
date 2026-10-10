import {z} from 'zod';
import {learningQuery,learningRequest} from '../../_shared';
import {readLearningCohortOptions} from '../../../../../lib/server/learning/cohorts';
export async function GET(request:Request){return learningRequest(request,false,actor=>{z.object({}).strict().parse(learningQuery(request));return readLearningCohortOptions(actor);});}
