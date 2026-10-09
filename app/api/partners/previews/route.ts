import {z} from "zod";
import {partnerRequest} from "../../../../lib/server/partners/http";
import {previewPartnerGuide} from "../../../../lib/server/partners/previews";
import {previewPartnerAssignment} from "../../../../lib/server/partners/assignments";
import {previewPartnerCheckpoint} from "../../../../lib/server/partners/submissions";
import {partnerGuideReviewSchema,partnerAssignmentReviewSchema,partnerCheckpointReviewSchema} from "../../../../lib/contracts/partners";
export async function POST(request:Request){return partnerRequest(request,true,(actor,body)=>{const input=z.union([partnerGuideReviewSchema,partnerAssignmentReviewSchema,partnerCheckpointReviewSchema]).parse(body);if(input.action.startsWith("assignment."))return previewPartnerAssignment(actor,input);if(input.action.startsWith("checkpoint."))return previewPartnerCheckpoint(actor,input);return previewPartnerGuide(actor,input);});}
