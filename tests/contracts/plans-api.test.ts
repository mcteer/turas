import { beforeEach,describe,expect,it,vi } from "vitest";
import { HttpFailure } from "../../lib/contracts/http";

const mocks=vi.hoisted(()=>({session:vi.fn(),csrf:vi.fn(),command:vi.fn(),
  receipt:vi.fn(),list:vi.fn(),detail:vi.fn(),history:vi.fn(),source:vi.fn()}));
vi.mock("../../lib/server/auth/sessions",()=>({getCurrentSession:mocks.session}));
vi.mock("../../lib/server/auth/csrf",()=>({checkSessionCsrf:mocks.csrf}));
vi.mock("../../lib/server/db/client",()=>({withTransaction:
  async(run:(client:unknown)=>Promise<unknown>)=>run({})}));
vi.mock("../../lib/server/plans/commands",()=>({submitPlanCommand:mocks.command,
  readPlanCommandReceipt:mocks.receipt}));
vi.mock("../../lib/server/plans/read",()=>({listPlans:mocks.list,
  readPlan:mocks.detail,readPlanHistory:mocks.history}));
vi.mock("../../lib/server/plans/sources",()=>({readPlanSource:mocks.source}));

import { GET as list,POST as create } from "../../app/api/plans/route";
import { GET as detail } from "../../app/api/plans/[planId]/route";
import { GET as history,POST as save } from "../../app/api/plans/[planId]/revisions/route";
import { POST as submit } from "../../app/api/plans/[planId]/submit/route";
import { GET as source } from "../../app/api/plans/[planId]/revisions/[revisionId]/sources/[dependencyId]/route";
import { GET as receipt } from "../../app/api/plans/commands/[requestKey]/route";

const id="00000000-0000-4000-8000-000000000001";
const params={params:Promise.resolve({planId:id})};
const post=(path:string,body:unknown)=>new Request(`http://localhost${path}`,{
  method:"POST",body:JSON.stringify(body)});

describe("plan HTTP boundaries",()=>{
  beforeEach(()=>{
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({membershipId:id});
    for (const mock of [mocks.command,mocks.list,mocks.detail,mocks.history,
      mocks.source,mocks.receipt]) mock.mockResolvedValue({contractVersion:"delivery-plan-v1"});
  });

  it("requires a current session and CSRF before create/save/submit",async()=>{
    mocks.session.mockResolvedValueOnce(null);
    expect((await create(post("/api/plans",{}))).status).toBe(401);
    mocks.csrf.mockImplementationOnce(()=>{throw new HttpFailure(403,"forbidden","Invalid CSRF");});
    expect((await save(post(`/api/plans/${id}/revisions`,{}),params)).status).toBe(403);
    expect(mocks.command).not.toHaveBeenCalled();
    expect((await submit(post(`/api/plans/${id}/submit`,{}),params)).status).toBe(200);
    expect(mocks.command.mock.calls[0][1].action).toBe("submit");
    expect(mocks.command.mock.calls[0][1].planId).toBe(id);
  });

  it("bounds bodies and uses private no-store responses",async()=>{
    expect((await create(new Request("http://localhost/api/plans",{
      method:"POST",body:"x".repeat(145_001)}))).status).toBe(413);
    expect((await create(new Request("http://localhost/api/plans",{
      method:"POST",body:"{"}))).status).toBe(422);
    const response=await create(post("/api/plans",{}));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.command.mock.calls[0][1].action).toBe("create");
  });

  it("validates scope IDs before read/list/history/source/receipt domain calls",async()=>{
    expect((await list(new Request("http://localhost/api/plans?customerId=bad"))).status).toBe(422);
    expect((await detail(new Request("http://localhost/api/plans/bad"),{
      params:Promise.resolve({planId:"bad"})})).status).toBe(422);
    expect((await history(new Request("http://localhost/api/plans/bad/revisions"),{
      params:Promise.resolve({planId:"bad"})})).status).toBe(422);
    expect((await source(new Request("http://localhost/api/plans/source"),{
      params:Promise.resolve({planId:id,revisionId:id,dependencyId:"bad"})})).status).toBe(422);
    expect((await receipt(new Request("http://localhost/api/plans/commands/key?customerId=bad"),{
      params:Promise.resolve({requestKey:"request_key"})})).status).toBe(422);
    expect(mocks.list).not.toHaveBeenCalled();
    expect(mocks.source).not.toHaveBeenCalled();
  });

  it("delegates list, detail, history and exact original source reads",async()=>{
    expect((await list(new Request(`http://localhost/api/plans?customerId=${id}`))).status).toBe(200);
    expect((await detail(new Request(`http://localhost/api/plans/${id}`),params)).status).toBe(200);
    expect((await history(new Request(`http://localhost/api/plans/${id}/revisions`),params)).status).toBe(200);
    expect((await source(new Request("http://localhost/api/plans/source"),{
      params:Promise.resolve({planId:id,revisionId:id,dependencyId:id})})).status).toBe(200);
    expect(mocks.list).toHaveBeenCalledOnce();
    expect(mocks.detail).toHaveBeenCalledOnce();
    expect(mocks.history).toHaveBeenCalledOnce();
    expect(mocks.source).toHaveBeenCalledOnce();
  });

  it("passes save and actor-scoped receipt requests through the shared envelope",async()=>{
    const saved=await save(post(`/api/plans/${id}/revisions`,{
      requestKey:"save_request_01",expectedAggregateVersion:1}),params);
    expect(saved.status).toBe(200);
    expect(mocks.command.mock.calls[0][1]).toMatchObject({
      action:"save",planId:id,requestKey:"save_request_01"});
    const returned=await receipt(new Request(
      `http://localhost/api/plans/commands/save_request_01?customerId=${id}`),{
      params:Promise.resolve({requestKey:"save_request_01"})});
    expect(returned.status).toBe(200);
    expect(mocks.receipt).toHaveBeenCalledWith(expect.anything(),"save_request_01",id,
      expect.anything());
  });

  it("uses a safe error envelope for a domain conflict",async()=>{
    mocks.command.mockRejectedValueOnce(new HttpFailure(409,"stale_plan","Reload before saving"));
    const response=await save(post(`/api/plans/${id}/revisions`,{}),params);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({error:{code:"stale_plan"}});
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
});
