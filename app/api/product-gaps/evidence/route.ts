import {gapRequest,gapQuery} from '../../../../lib/server/gaps/http';
import {searchGapEvidence} from '../../../../lib/server/gaps/evidence';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export function GET(request:Request){return gapRequest(request,false,actor=>searchGapEvidence(actor,gapQuery(request)));}
