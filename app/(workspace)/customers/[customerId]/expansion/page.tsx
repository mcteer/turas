import {notFound} from 'next/navigation';
import {expansionId} from '../../../../../lib/contracts/expansion';
import {ExpansionWorkspace} from '../../../../_components/expansion/workspace';
export default async function ExpansionPage({params,searchParams}:{params:Promise<{customerId:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const {customerId}=await params,query=await searchParams;
 const workload=query.workloadId===undefined?null:expansionId.safeParse(query.workloadId);
 if(workload&&!workload.success)notFound();
 const initialWorkloadId=workload?.data??'';
 return <ExpansionWorkspace key={`${customerId}:${initialWorkloadId}`} customerId={customerId} initialWorkloadId={initialWorkloadId}/>;
}
