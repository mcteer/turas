import {LearningRefreshHandoff} from '../../../../_components/learning/refresh';
export default async function LearningRefreshPage({params}:{params:Promise<{id:string}>}){return <LearningRefreshHandoff id={(await params).id}/>;}
