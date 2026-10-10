import {LearningCandidateDetail} from '../../../../_components/learning/candidate';
export default async function LearningCandidatePage({params}:{params:Promise<{id:string}>}){const {id}=await params;return <LearningCandidateDetail id={id}/>;}
