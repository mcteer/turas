import { PlanDetail } from "../../../../../_components/plans/plan-detail";

export default async function CustomerPlanPage({params}:{
  params:Promise<{customerId:string;planId:string}>}) {
  const {customerId,planId}=await params;
  return <PlanDetail customerId={customerId} planId={planId}/>;
}
