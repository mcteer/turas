import {ReportList} from '../../../../_components/reports/report-list';
export default async function ReportsPage({params}:{params:Promise<{customerId:string}>}){const {customerId}=await params;return <ReportList key={customerId} customerId={customerId}/>;}
