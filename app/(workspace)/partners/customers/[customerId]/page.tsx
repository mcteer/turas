import { requirePartnerPage } from "../../../../../lib/server/partners/page";
import { PartnerWorkspace } from "../../../../_components/partners/workspace";
export const dynamic="force-dynamic";
export default async function PartnerCustomerPage({params}:{params:Promise<{customerId:string}>}){await requirePartnerPage();return <PartnerWorkspace customerId={(await params).customerId}/>;}
