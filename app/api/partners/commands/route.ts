import {z} from "zod";
import {partnerRequest} from "../../../../lib/server/partners/http";
import {writePartnerGuide} from "../../../../lib/server/partners/guides";
import {decidePartnerGuide} from "../../../../lib/server/partners/previews";
import {decidePartnerAssignment} from "../../../../lib/server/partners/assignments";
import {writePartnerCheckpoint,decidePartnerCheckpoint} from "../../../../lib/server/partners/submissions";
import {partnerGuideDraftCommandSchema,partnerGuideReviewCommandSchema,partnerAssignmentCommandSchema,partnerCheckpointCommandSchema,partnerCheckpointDecisionSchema} from "../../../../lib/contracts/partners";
export async function POST(request:Request){return partnerRequest(request,true,async(actor,body)=>{const input=z.union([partnerGuideDraftCommandSchema,partnerGuideReviewCommandSchema,partnerAssignmentCommandSchema,partnerCheckpointCommandSchema,partnerCheckpointDecisionSchema]).parse(body);if(input.action.startsWith("assignment."))return decidePartnerAssignment(actor,input);if(input.action.startsWith("checkpoint."))return "previewId" in input?decidePartnerCheckpoint(actor,input):writePartnerCheckpoint(actor,input);return "previewId" in input?decidePartnerGuide(actor,input):writePartnerGuide(actor,input);});}
