import { requirePartnerPage } from "../../../lib/server/partners/page";
import { PartnerWorkspace } from "../../_components/partners/workspace";
export const dynamic="force-dynamic";
export default async function PartnerPage(){await requirePartnerPage();return <PartnerWorkspace/>;}
