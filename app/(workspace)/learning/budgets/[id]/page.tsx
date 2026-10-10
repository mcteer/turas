import {LearningBudgetDetail} from '../../../../_components/learning/budget';
export default async function LearningBudgetPage({params}:{params:Promise<{id:string}>}){const {id}=await params;return <LearningBudgetDetail id={id}/>;}
