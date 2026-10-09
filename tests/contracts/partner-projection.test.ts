import { describe,it,expect } from "vitest";
import { partnerCustomerCard,partnerEngagementCard,partnerAssignmentPreview } from "../../lib/server/partners/projection";
describe("partner projection allowlists",()=>{
 it("drops private target and authority internals from an assignment review projection",()=>{
  const row={requestId:"request",previewId:"preview",expiresAt:"2026-01-01T00:00:00.000Z",action:"assignment.create",guideId:"guide",revisionId:"revision",membershipId:"member",version:1,privateLineage:"PRIVATE_LINEAGE",targetGrant:{revision:99},sessionId:"PRIVATE_SESSION"},view=partnerAssignmentPreview(row);expect(Object.keys(view).sort()).toEqual(["contractVersion","requestId","previewId","expiresAt","action","guideId","revisionId","membershipId","version"].sort());expect(JSON.stringify(view)).not.toContain("PRIVATE");
 });
 it("never releases extra customer fields, counts, private lineage or conversation metadata",()=>{
  const row={id:"00000000-0000-4000-8000-000000000240",display_name:"Synthetic",finance:"PRIVATE_FINANCE",lineage:"PRIVATE_LINEAGE",conversation:"PRIVATE_CHAT",hidden_count:14};
  const card=partnerCustomerCard(row);expect(Object.keys(card).sort()).toEqual(["customerId","displayName","href"].sort());expect(JSON.stringify(card)).not.toContain("PRIVATE");expect(card).not.toHaveProperty("hidden_count");
 });
 it("projects delivery links without other partner prose or internal commercial fields",()=>{
  const card=partnerEngagementCard({engagementId:"e",planId:"p",customerId:"c",title:"Synthetic",contentAvailability:"readable",reviewRequired:false,activeBaselineId:"b",acceptedRevisionId:"r",baselineNumber:1,acceptedAt:"2026-01-01T00:00:00.000Z",workloadId:null,audience:"delivery",contractVersion:"delivery-plan-v1",milestones:[{private:"PRIVATE"}],workPackages:null,staffingAssignments:undefined});
  expect(JSON.stringify(card)).not.toContain("PRIVATE");expect(card.links.plan).toBe("/customers/c/plans/p");expect(card.links.execution).toBe("/customers/c/engagements/e/execution");expect(card).not.toHaveProperty("milestones");
 });
});
