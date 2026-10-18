import Link from 'next/link';
import {operationsPageSession,operationsPagePeriod} from '../../../../lib/server/ordinary-operations/page-access';
import {readOperationsEngagement} from '../../../../lib/server/ordinary-operations/reads';
import {OrdinaryEngagementScenario} from '../../../_components/ordinary-engagement-scenario';
export default async function EngagementPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const actor=await operationsPageSession(),{id}=await params,period=operationsPagePeriod(await searchParams),brief=await readOperationsEngagement(actor,{engagementId:id,...period});
 return <main className="profile-page"><header className="profile-header"><div><Link href={`/portfolio?fromDate=${period.fromDate}&toDate=${period.toDate}`}>Delivery Operations Review</Link><h1>{brief.engagement.title}</h1><p>Baseline {brief.engagement.baselineNumber} · {brief.summary?.state??'Execution not initialized'} · as of {brief.asOf}</p><Link href={`/customers/${brief.engagement.customerId}/engagements/${id}`}>Reviewed engagement details</Link></div></header>
 <section className="profile-section"><div className="profile-section-head"><h2>Evidence and Delivery</h2></div><p>{brief.summary?.status.blockers.length??'unknown'} material blockers; {brief.summary?.status.unknownDates.length??'unknown'} dates unknown. Remaining effort: {brief.summary?.effort.remainingMinutes??'unknown'} minutes.</p>{brief.summary?.status.blockers.map(b=><p key={b.id}>{b.title} · {b.severity} · review {b.reviewDate??'date unknown'}</p>)}<p>Proposed interventions: {brief.proposals.length}. An intervention needs its exact version and separate human decision in Turi.</p></section>
 {brief.finance.status==='available'?<OrdinaryEngagementScenario baseline={brief.finance.values} currency={brief.finance.currency}/>:<p>Financial inputs are restricted for this account.</p>}
 </main>;
}
