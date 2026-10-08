import { z } from "zod";
import { HttpFailure } from "../../contracts/http";
import { researchLimits } from "../../contracts/research";
import { parsePublicUrl } from "./fetch";

const resultSchema = z.object({ url: z.url(),title: z.string().nullable().optional() }).passthrough();
const responseSchema = z.object({ request_id: z.string(),query: z.string(),
  results: z.array(resultSchema).max(100) }).passthrough();

export type ContextSearchTransport = (request: Request) => Promise<Response>;

export async function discoverContext(query: string,key: string,
  options: { transport?: ContextSearchTransport; deadline?: Date } = {}) {
  if (!query.trim() || query.length > 500 || !key.trim()) {
    throw new HttpFailure(503,"research_unavailable","Public research unavailable");
  }
  const timeout = Math.min(researchLimits.searchTimeoutMs,
    options.deadline ? options.deadline.getTime()-Date.now() : researchLimits.searchTimeoutMs);
  if (timeout <= 0) throw new HttpFailure(503,"deadline_exceeded","Research deadline exceeded");
  const request = new Request("https://api.context.dev/v1/web/search",{
    method: "POST",headers: { "content-type": "application/json",
      authorization: `Bearer ${key}` },
    body: JSON.stringify({ query,numResults: 10,
      markdownOptions: { enabled: false },highlightsOptions: { enabled: false } }),
    signal: AbortSignal.timeout(timeout),
  });
  let response: Response;
  try { response = await (options.transport ?? fetch)(request); }
  catch { throw new HttpFailure(503,"provider_unconfirmed","Public discovery outcome unconfirmed"); }
  if (response.status === 429) throw new HttpFailure(429,"provider_rate_limited","Public discovery rate limited");
  if (!response.ok) throw new HttpFailure(503,"provider_unavailable","Public discovery unavailable");
  const reader = response.body?.getReader();
  if (!reader) throw new HttpFailure(503,"provider_unavailable","Public discovery unavailable");
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    bytes += part.value.byteLength;
    if (bytes > 65_536) {
      await reader.cancel().catch(() => undefined);
      throw new HttpFailure(503,"provider_unavailable","Public discovery response too large");
    }
    chunks.push(part.value);
  }
  let raw: unknown;
  try { raw = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown; }
  catch { throw new HttpFailure(503,"provider_unavailable","Public discovery response invalid"); }
  const parsed = responseSchema.safeParse(raw);
  if (!parsed.success || parsed.data.query !== query) {
    throw new HttpFailure(503,"provider_unavailable","Public discovery response invalid");
  }
  const results = [];
  for (const item of parsed.data.results.slice(0,researchLimits.resultsPerSearch)) {
    try {
      const url = parsePublicUrl(item.url);
      results.push({ url: url.toString(),title: (item.title ?? "Public source").slice(0,200),
        publishedDate: null });
    } catch { /* Provider result is outside the public fetch boundary. */ }
  }
  return { requestId: parsed.data.request_id,results };
}

export function discoveryInScope(mode: "recon" | "practices",
  fields: Record<string,unknown>,url: string): boolean {
  let parsed: URL;
  try { parsed = parsePublicUrl(url); }
  catch { return false; }
  if (mode === "recon") {
    const domain = String(fields.publicDomain ?? "").toLowerCase();
    // Public recon includes customer, vendor, organizer and practitioner sources.
    // Subject identity and exact support are checked after retrieval, not by host alone.
    return fields.sourcePolicy === "public-subject-v2" ? Boolean(domain) :
      parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`);
  }
  return true;
}
