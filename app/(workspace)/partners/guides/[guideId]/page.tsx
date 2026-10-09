import { requirePartnerPage } from "../../../../../lib/server/partners/page";
import { PartnerGuideDetail } from "../../../../_components/partners/guides";
export const dynamic="force-dynamic";
export default async function PartnerGuidePage({params}:{params:Promise<{guideId:string}>}){await requirePartnerPage();return <PartnerGuideDetail guideId={(await params).guideId}/>;}
