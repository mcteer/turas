import {gapRequest} from '../../../../../lib/server/gaps/http';
import {previewGapCanonicalization} from '../../../../../lib/server/gaps/canonicalization';
export const runtime='nodejs';export const dynamic='force-dynamic';
export function POST(request:Request){return gapRequest(request,true,(actor,body)=>previewGapCanonicalization(actor,body));}
