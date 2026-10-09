import {requireGapPage} from '../../../lib/server/gaps/page';
import {GapRegistry} from '../../_components/product-gaps/registry';
export const dynamic='force-dynamic';
export default async function ProductGapsPage(){await requireGapPage();return <GapRegistry/>;}
