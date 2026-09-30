import { beforeEach,describe,expect,it,vi } from "vitest";
import { HttpFailure } from "../../lib/contracts/http";

const mocks=vi.hoisted(()=>({session:vi.fn(),csrf:vi.fn(),preview:vi.fn(),decision:vi.fn()}));
vi.mock("../../lib/server/auth/sessions",()=>({getCurrentSession:mocks.session}));
vi.mock("../../lib/server/auth/csrf",()=>({checkSessionCsrf:mocks.csrf}));
vi.mock("../../lib/server/db/client",()=>({withTransaction:
  async(run:(client:unknown)=>Promise<unknown>)=>run({})}));
vi.mock("../../lib/server/plans/decisions",()=>({
  createPlanReviewPreview:mocks.preview,decidePlan:mocks.decision}));

import { POST as preview } from "../../app/api/plans/[planId]/review-preview/route";
import { POST as decide } from "../../app/api/plans/[planId]/decisions/route";

const id="00000000-0000-4000-8000-000000000001";
const params={params:Promise.resolve({planId:id})};
const post=(route:string,body:unknown)=>new Request(`http://localhost${route}`,{
  method:"POST",body:JSON.stringify(body)});

describe("plan decision HTTP boundaries",()=>{
  beforeEach(()=>{
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({membershipId:id});
    mocks.preview.mockResolvedValue({contractVersion:"delivery-plan-v1",previewId:id});
    mocks.decision.mockResolvedValue({contractVersion:"delivery-plan-v1",decisionId:id});
  });
  it("requires session and CSRF and delegates exact preview/decision",async()=>{
    mocks.session.mockResolvedValueOnce(null);
    expect((await preview(post(`/api/plans/${id}/review-preview`,{}),params)).status).toBe(401);
    mocks.csrf.mockImplementationOnce(()=>{throw new HttpFailure(403,"forbidden","Invalid CSRF");});
    expect((await decide(post(`/api/plans/${id}/decisions`,{}),params)).status).toBe(403);
    expect(mocks.preview).not.toHaveBeenCalled();
    expect(mocks.decision).not.toHaveBeenCalled();
    expect((await preview(post(`/api/plans/${id}/review-preview`,{}),params)).status).toBe(200);
    expect((await decide(post(`/api/plans/${id}/decisions`,{}),params)).status).toBe(200);
    expect(mocks.preview).toHaveBeenCalledWith(expect.anything(),id,{},expect.anything());
    expect(mocks.decision).toHaveBeenCalledWith(expect.anything(),id,{},expect.anything());
  });
  it("returns safe reviewer denial without a decision write",async()=>{
    mocks.decision.mockRejectedValueOnce(new HttpFailure(403,"forbidden","Action not allowed"));
    const response=await decide(post(`/api/plans/${id}/decisions`,{}),params);
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({error:{code:"forbidden"}});
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
  it("keeps exact digest, expired preview and revoked replay conflicts private",async()=>{
    const request={action:"accept",requestKey:"review_case_1",
      revisionId:id,contentDigest:"a".repeat(64),expectedAggregateVersion:2,
      reviewPreviewId:id,rationale:"Synthetic exact review",
      deliverySuitabilityConfirmed:true};
    for(const [failure,status,code] of [
      [new HttpFailure(409,"review_version_changed","Digest changed"),409,
        "review_version_changed"],
      [new HttpFailure(409,"stale_review","Preview expired"),409,"stale_review"],
      [new HttpFailure(401,"unauthorized","Reviewer role revoked"),401,
        "unauthorized"],
    ] as const){
      mocks.decision.mockRejectedValueOnce(failure);
      const response=await decide(post(`/api/plans/${id}/decisions`,request),params);
      expect(response.status).toBe(status);
      expect(await response.json()).toMatchObject({error:{code}});
      expect(response.headers.get("cache-control")).toBe("private, no-store");
    }
    expect(mocks.decision).toHaveBeenCalledTimes(3);
  });
});
