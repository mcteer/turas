import { EngagementDetailView } from "../../../../../_components/plans/engagement-detail";

export default async function CustomerEngagementPage({params}:{
  params:Promise<{customerId:string;engagementId:string}>}) {
  const {customerId,engagementId}=await params;
  return <EngagementDetailView customerId={customerId} engagementId={engagementId}/>;
}
