import { LearningFeedbackDetail } from '../../../../_components/learning/feedback';
export default async function LearningFeedbackPage({params}:{params:Promise<{id:string}>}){const {id}=await params;return <LearningFeedbackDetail id={id}/>;}
