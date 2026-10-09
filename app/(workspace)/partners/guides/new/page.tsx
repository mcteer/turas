import { z } from "zod";
import { notFound } from "next/navigation";
import { requirePartnerPage } from "../../../../../lib/server/partners/page";
import { PartnerGuideCreate } from "../../../../_components/partners/guides";
export const dynamic="force-dynamic";
export default async function NewPartnerGuidePage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){const actor=await requirePartnerPage();if(actor.kind!=="internal")notFound();const parsed=z.object({customerId:z.uuid(),engagementId:z.uuid()}).strict().safeParse(await searchParams);if(!parsed.success)notFound();return <PartnerGuideCreate customerId={parsed.data.customerId} engagementId={parsed.data.engagementId}/>;}
