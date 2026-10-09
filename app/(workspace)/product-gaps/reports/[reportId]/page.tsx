import {requireGapPage} from '../../../../../lib/server/gaps/page';
import {gapRouteId} from '../../../../../lib/server/gaps/http';
import {GapReport} from '../../../../_components/product-gaps/report';
export const dynamic='force-dynamic';
export default async function EngineeringReportPage({params}:{params:Promise<{reportId:string}>}){await requireGapPage();return <GapReport reportId={gapRouteId((await params).reportId)}/>;}
