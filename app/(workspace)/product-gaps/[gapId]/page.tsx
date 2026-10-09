import {requireGapPage} from '../../../../lib/server/gaps/page';
import {gapRouteId} from '../../../../lib/server/gaps/http';
import {GapDetail} from '../../../_components/product-gaps/detail';
export const dynamic='force-dynamic';
export default async function ProductGapPage({params}:{params:Promise<{gapId:string}>}){await requireGapPage();const id=gapRouteId((await params).gapId);return <GapDetail gapId={id}/>;}
