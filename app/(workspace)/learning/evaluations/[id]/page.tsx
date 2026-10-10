import {LearningEvaluationDetail} from '../../../../_components/learning/evaluation';
export default async function LearningEvaluationPage({params}:{params:Promise<{id:string}>}){const {id}=await params;return <LearningEvaluationDetail id={id}/>;}
