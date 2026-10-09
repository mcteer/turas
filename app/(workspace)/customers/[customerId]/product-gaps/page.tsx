import {requireGapPage} from '../../../../../lib/server/gaps/page';
import {gapRouteId} from '../../../../../lib/server/gaps/http';
import {GapRegistry} from '../../../../_components/product-gaps/registry';
export const dynamic='force-dynamic';
export default async function CustomerGapsPage({params}:{params:Promise<{customerId:string}>}){await requireGapPage();const id=gapRouteId((await params).customerId);return <GapRegistry customerId={id}/>;}
