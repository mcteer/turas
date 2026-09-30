import Link from "next/link";
import { PlanList } from "../../../../_components/plans/plan-list";

export default async function CustomerPlansPage({params}:{
  params:Promise<{customerId:string}>}) {
  const {customerId}=await params;
  return <main className="profile-page"><nav aria-label="Breadcrumb"
    className="profile-breadcrumb"><Link href="/customers">Customers</Link>
    <span aria-hidden="true">/</span><Link href={`/customers/${customerId}`}>Profile</Link>
    <span aria-hidden="true">/</span><span>Plans</span></nav>
    <PlanList customerId={customerId}/></main>;
}
