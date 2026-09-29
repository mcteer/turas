import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { fetchPublicDocument, publicAddress, resolvePublicTarget,
  type PublicFetchTransport } from "../../lib/server/research/fetch";
import { discoveryInScope } from "../../lib/server/research/discovery";

const publicDns = async () => [{ address: "8.8.8.8",family: 4 }];
const body = (bytes: Uint8Array) => (async function* () { yield bytes; })();

describe("pinned public fetch boundary", () => {
  it("matches recon identity by destination host after redirects",() => {
    const fields = { publicDomain: "example.org" };
    expect(discoveryInScope("recon",fields,"https://docs.example.org/path")).toBe(true);
    expect(discoveryInScope("recon",fields,"https://evil.org/example.org/path")).toBe(false);
    expect(discoveryInScope("recon",fields,"https://example.org.evil.org/path")).toBe(false);
  });
  it("rejects private, reserved, mapped and mixed DNS answers", async () => {
    for (const address of ["127.0.0.1","10.1.2.3","169.254.169.254",
      "192.168.1.2","100.64.0.1","::1","fc00::1","::ffff:127.0.0.1",
      "2001:db8::1"]) expect(publicAddress(address)).toBe(false);
    expect(publicAddress("8.8.8.8")).toBe(true);
    await expect(resolvePublicTarget("https://public.example.org/path",async () => [
      { address: "8.8.8.8",family: 4 },{ address: "127.0.0.1",family: 4 },
    ])).rejects.toMatchObject({ code: "blocked_url" });
    await expect(resolvePublicTarget("https://127.0.0.1/admin"))
      .rejects.toMatchObject({ code: "blocked_url" });
    await expect(resolvePublicTarget("http://public.example.org/",publicDns))
      .rejects.toMatchObject({ code: "blocked_url" });
  });

  it("validates every redirect and never sends private redirects", async () => {
    const called: string[] = [];
    const transport: PublicFetchTransport = async (target) => {
      called.push(target.url.toString());
      return { status: 302,headers: { location: "https://127.0.0.1/private" },
        body: body(new Uint8Array()) };
    };
    await expect(fetchPublicDocument("https://public.example.org/start",{
      resolve: publicDns,transport })).rejects.toMatchObject({ code: "blocked_url" });
    expect(called).toEqual(["https://public.example.org/start"]);
  });

  it("re-resolves a public-looking redirect and blocks rebinding before transport",async () => {
    const sent: string[] = [];
    const resolved: string[] = [];
    const transport: PublicFetchTransport = async (target) => {
      sent.push(`${target.hostname}@${target.address}`);
      return { status: 302,headers: { location: "https://alias.example.org/final" },
        body: body(new Uint8Array()) };
    };
    await expect(fetchPublicDocument("https://public.example.org/start",{
      resolve: async (host) => {
        resolved.push(host);
        return [{ address: host === "public.example.org" ? "8.8.8.8" : "10.0.0.8",
          family: 4 }];
      },transport })).rejects.toMatchObject({ code: "blocked_url" });
    expect(resolved).toEqual(["public.example.org","alias.example.org"]);
    expect(sent).toEqual(["public.example.org@8.8.8.8"]);
  });

  it("pins the validated address, accepts bounded text, and rejects decompression bombs", async () => {
    const destinations: string[] = [];
    const transport: PublicFetchTransport = async (target) => {
      destinations.push(target.address);
      return { status: 200,headers: { "content-type": "text/html",
        "content-encoding": "gzip" },body: body(gzipSync("<main>Public text</main>")) };
    };
    const fetched = await fetchPublicDocument("https://public.example.org/info",{
      resolve: publicDns,transport });
    expect(destinations).toEqual(["8.8.8.8"]);
    expect(fetched.text).toBe("<main>Public text</main>");
    const bomb: PublicFetchTransport = async () => ({ status: 200,
      headers: { "content-type": "text/plain","content-encoding": "gzip" },
      body: body(gzipSync("a".repeat(2_097_153))) });
    await expect(fetchPublicDocument("https://public.example.org/info",{
      resolve: publicDns,transport: bomb })).rejects.toMatchObject({ code: "document_too_large" });
  });

  it("charges redirect bodies to the same fetch budget", async () => {
    let calls = 0;
    const transport: PublicFetchTransport = async () => {
      calls += 1;
      return calls === 1 ? { status: 302,
        headers: { location: "https://public.example.org/final" },
        body: body(Buffer.from("redirect")) } : { status: 200,
        headers: { "content-type": "text/plain" },body: body(Buffer.from("final")) };
    };
    const result = await fetchPublicDocument("https://public.example.org/start",{
      resolve: publicDns,transport,remainingBytes: 13 });
    expect(result.bytes).toBe(13);
    expect(result.text).toBe("final");
    expect(result.aliases).toEqual(["https://public.example.org/start"]);
    expect(result.canonicalUrl).toBe("https://public.example.org/final");
    calls = 0;
    await expect(fetchPublicDocument("https://public.example.org/start",{
      resolve: publicDns,transport,remainingBytes: 12 }))
      .rejects.toMatchObject({ code: "document_too_large" });
  });
});
