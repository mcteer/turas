import { beforeEach,describe,expect,it,vi } from "vitest";
import { HttpFailure } from "../../lib/contracts/http";

const mocks=vi.hoisted(()=>({session:vi.fn(),diff:vi.fn()}));
vi.mock("../../lib/server/auth/sessions",()=>({getCurrentSession:mocks.session}));
vi.mock("../../lib/server/db/client",()=>({withTransaction:
  async(run:(client:unknown)=>Promise<unknown>)=>run({})}));
vi.mock("../../lib/server/plans/diff",()=>({readPlanDiff:mocks.diff}));

import { GET } from "../../app/api/plans/[planId]/diff/route";

const planId="00000000-0000-4000-8000-000000000001";
const base="00000000-0000-4000-8000-000000000002";
const target="00000000-0000-4000-8000-000000000003";
const context={params:Promise.resolve({planId})};
const request=(query:string)=>new Request(`http://localhost/api/plans/${planId}/diff${query}`);

describe("plan diff HTTP boundary",()=>{
  beforeEach(()=>{
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({membershipId:planId});
    mocks.diff.mockResolvedValue({contractVersion:"plan-diff-v1",changes:[]});
  });
  it("requires a session and both exact revision IDs",async()=>{
    mocks.session.mockResolvedValueOnce(null);
    expect((await GET(request(`?base=${base}&target=${target}`),context)).status).toBe(401);
    expect((await GET(request(`?base=${base}`),context)).status).toBe(422);
    expect(mocks.diff).not.toHaveBeenCalled();
  });
  it("delegates authorized comparison and sends no-store response",async()=>{
    const response=await GET(request(`?base=${base}&target=${target}`),context);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.diff).toHaveBeenCalledWith(expect.anything(),planId,base,target,
      expect.anything());
  });
  it("returns the safe withheld error",async()=>{
    mocks.diff.mockRejectedValueOnce(new HttpFailure(409,"plan_unavailable",
      "Plan comparison unavailable"));
    const response=await GET(request(`?base=${base}&target=${target}`),context);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({error:{code:"plan_unavailable"}});
  });
});
