import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpFailure } from "../../lib/contracts/http";

const mocks = vi.hoisted(() => ({ session: vi.fn(),csrf: vi.fn(),search: vi.fn(),
  citation: vi.fn() }));
vi.mock("../../lib/server/auth/sessions", () => ({ getCurrentSession: mocks.session }));
vi.mock("../../lib/server/auth/csrf", () => ({ checkSessionCsrf: mocks.csrf }));
vi.mock("../../lib/server/retrieval/search", () => ({ searchEvidence: mocks.search }));
vi.mock("../../lib/server/retrieval/citations", () => ({ resolveRetrievalCitation: mocks.citation }));
vi.mock("../../lib/server/db/client", () => ({ withTransaction:
  async (run: (client: unknown) => Promise<unknown>) => run({}) }));

import { POST } from "../../app/api/retrieval/search/route";
import { GET } from "../../app/api/retrieval/citations/[id]/route";

const id = "00000000-0000-4000-8000-000000000001";
describe("retrieval routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ membershipId: id });
    mocks.search.mockResolvedValue({ version: "retrieval-v1",results: [] });
    mocks.citation.mockResolvedValue({ citationId: id,text: "Synthetic passage" });
  });

  it("requires a session and CSRF, and returns private no-store data", async () => {
    const request = new Request("http://localhost/api/retrieval/search",{
      method: "POST",body: JSON.stringify({ scope: "shared",query: "cache" }) });
    mocks.session.mockResolvedValueOnce(null);
    expect((await POST(request)).status).toBe(401);
    expect(mocks.search).not.toHaveBeenCalled();
    mocks.csrf.mockImplementationOnce(() => { throw new HttpFailure(403,"forbidden","Invalid CSRF"); });
    expect((await POST(new Request("http://localhost/api/retrieval/search",{
      method: "POST",body: "{}" }))).status).toBe(403);
    const response = await POST(new Request("http://localhost/api/retrieval/search",{
      method: "POST",body: JSON.stringify({ scope: "shared",query: "cache" }) }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.search).toHaveBeenCalledTimes(1);
  });

  it("rejects oversized and invalid JSON bodies before search", async () => {
    expect((await POST(new Request("http://localhost/api/retrieval/search",{
      method: "POST",body: "x".repeat(4_097) }))).status).toBe(413);
    expect((await POST(new Request("http://localhost/api/retrieval/search",{
      method: "POST",body: "{" }))).status).toBe(422);
    expect(mocks.search).not.toHaveBeenCalled();
  });

  it("validates citation IDs and delegates to the current domain resolver", async () => {
    const request = new Request("http://localhost/api/retrieval/citations/nope");
    expect((await GET(request,{ params: Promise.resolve({ id: "nope" }) })).status).toBe(422);
    const result = await GET(request,{ params: Promise.resolve({ id }) });
    expect(result.status).toBe(200);
    expect(result.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.citation).toHaveBeenCalledOnce();
  });
});
