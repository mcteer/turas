import {requirePartnerPage} from "../../../../../lib/server/partners/page";
import {PartnerLearningDetail} from "../../../../_components/partners/learning";
export const dynamic="force-dynamic";
export default async function PartnerLearningPage({params}:{params:Promise<{assignmentId:string}>}){await requirePartnerPage();return <PartnerLearningDetail assignmentId={(await params).assignmentId}/>;}
