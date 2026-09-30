import { beforeEach,describe,expect,it,vi } from "vitest";
import { HttpFailure } from "../../lib/contracts/http";

const mocks=vi.hoisted(()=>({session:vi.fn(),csrf:vi.fn(),start:vi.fn(),
  status:vi.fn(),cancel:vi.fn()}));
vi.mock("../../lib/server/auth/sessions",()=>({getCurrentSession:mocks.session}));
vi.mock("../../lib/server/auth/csrf",()=>({checkSessionCsrf:mocks.csrf}));
vi.mock("../../lib/server/db/client",()=>({withTransaction:
  async(run:(client:unknown)=>Promise<unknown>)=>run({})}));
vi.mock("../../lib/server/plans/drafting",()=>({startPlanDraft:mocks.start,
  getPlanDraft:mocks.status,cancelPlanDraft:mocks.cancel}));

import { POST as start } from "../../app/api/plan-drafting/route";
import { GET as status } from "../../app/api/plan-drafting/[attemptId]/route";
import { POST as cancel } from "../../app/api/plan-drafting/[attemptId]/cancel/route";

const id="00000000-0000-4000-8000-000000000001";
const params={params:Promise.resolve({attemptId:id})};
const post=(path:string,body:unknown)=>new Request(`http://localhost${path}`,{
  method:"POST",body:JSON.stringify(body)});

describe("plan drafting HTTP boundary",()=>{
  beforeEach(()=>{
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({membershipId:id});
    mocks.start.mockResolvedValue({attemptId:id,state:"prepared"});
    mocks.status.mockResolvedValue({attemptId:id,state:"running"});
    mocks.cancel.mockResolvedValue({attemptId:id,state:"cancelled"});
  });

  it("requires authentication and CSRF before admission and cancellation",async()=>{
    mocks.session.mockResolvedValueOnce(null);
    expect((await start(post("/api/plan-drafting",{}))).status).toBe(401);
    mocks.csrf.mockImplementationOnce(()=>{
      throw new HttpFailure(403,"forbidden","Invalid CSRF");
    });
    expect((await cancel(post(`/api/plan-drafting/${id}/cancel`,{}),params)).status)
      .toBe(403);
    expect(mocks.cancel).not.toHaveBeenCalled();
  });

  it("bounds input and returns actor-scoped status",async()=>{
    expect((await start(new Request("http://localhost/api/plan-drafting",{
      method:"POST",body:"x".repeat(145_001)}))).status).toBe(413);
    expect((await status(new Request(`http://localhost/api/plan-drafting/${id}`),params))
      .status).toBe(200);
    expect(mocks.status).toHaveBeenCalledWith(expect.anything(),id,expect.anything());
    const denied=await status(new Request("http://localhost/api/plan-drafting/bad"),{
      params:Promise.resolve({attemptId:"bad"})});
    expect(denied.status).toBe(422);
  });

  it("returns durable conflict codes without provider or draft writes",async()=>{
    mocks.start.mockRejectedValueOnce(new HttpFailure(409,"stale_plan","Reload plan"));
    const response=await start(post("/api/plan-drafting",{}));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({error:{code:"stale_plan"}});
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
});
