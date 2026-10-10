import {LearningMeasurementDetail} from '../../../../_components/learning/measurements';
export default async function LearningMeasurementPage({params}:{params:Promise<{id:string}>}){const {id}=await params;return <LearningMeasurementDetail id={id}/>;}
