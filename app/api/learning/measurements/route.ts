import {learningQuery,learningRequest} from '../_shared';
import {listLearningMeasurements,createLearningMeasurement} from '../../../../lib/server/learning/measurements';
export async function GET(request:Request){return learningRequest(request,false,actor=>listLearningMeasurements(actor,learningQuery(request)));}
export async function POST(request:Request){return learningRequest(request,true,(actor,body)=>createLearningMeasurement(actor,body),131072);}
