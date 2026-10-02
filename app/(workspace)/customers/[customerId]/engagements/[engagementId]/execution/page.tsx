import { ExecutionOverview } from "../../../../../../_components/execution/overview";
export default async function CustomerExecutionPage({params}:{params:Promise<{customerId:string;engagementId:string}>}) {
  const {customerId,engagementId}=await params;return <ExecutionOverview customerId={customerId} engagementId={engagementId}/>;
}
