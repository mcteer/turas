import Link from "next/link";
import { PlanEditor } from "../../../../../_components/plans/plan-editor";

export default async function NewCustomerPlanPage({params}:{
  params:Promise<{customerId:string}>}) {
  const {customerId}=await params;
  return <main className="profile-page"><nav aria-label="Breadcrumb"
    className="profile-breadcrumb"><Link href="/customers">Customers</Link>
    <span aria-hidden="true">/</span><Link href={`/customers/${customerId}`}>Profile</Link>
    <span aria-hidden="true">/</span><Link href={`/customers/${customerId}/plans`}>Plans</Link>
    <span aria-hidden="true">/</span><span>New plan</span></nav>
    <header className="profile-header"><div><p className="profile-eyebrow">Customer delivery</p>
      <h1>New plan</h1><p>Define the scope, evidence, and milestones before submitting for review.</p></div>
      <span className="profile-badge">Draft</span></header>
    <PlanEditor customerId={customerId}/></main>;
}
