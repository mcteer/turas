import { LearningDraftDetail } from '../../../../_components/learning/drafts';
export default async function LearningDraftPage({params}:{params:Promise<{id:string}>}){const {id}=await params;return <LearningDraftDetail id={id}/>;}
