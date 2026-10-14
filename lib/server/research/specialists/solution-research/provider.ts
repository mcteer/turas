import { z } from "zod";
import { setTimeout as delay } from "node:timers/promises";
import { extractSources, publicResearchUrl } from "./evidence";

export class ResearchProviderError extends Error {
  readonly reason:
    | "not_configured"
    | "unauthorized"
    | "unavailable"
    | "invalid_response"
    | "response_too_large";
  readonly httpStatus?: number;
  constructor(reason: ResearchProviderError["reason"], httpStatus?: number) {
    super(`Public research ${reason}.`);
    this.name = "ResearchProviderError";
    this.reason = reason;
    this.httpStatus = httpStatus;
  }
}

// CONTEXT_DEV_API_KEY is the Context.dev SDK/API name. CONTEXT_API_KEY remains
// accepted for existing Turas deployments while environments are migrated.
function contextApiKey() {
  return (process.env.CONTEXT_DEV_API_KEY ?? process.env.CONTEXT_API_KEY)?.trim();
}

async function request(
  path: string,
  signal: AbortSignal,
  body?: unknown,
  query?: URLSearchParams,
): Promise<unknown> {
  const token = contextApiKey();
  if (!token) throw new ResearchProviderError("not_configured");
  const url = new URL(path, "https://api.context.dev");
  if (query) url.search = query.toString();
  const response = await fetch(url, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    redirect: "error",
    signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]),
  });
  if (!response.ok || !response.body) {
    await response.body?.cancel();
    throw new ResearchProviderError(
      response.status === 401 || response.status === 403
        ? "unauthorized"
        : "unavailable",
      response.status,
    );
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 1_000_000) {
        await reader.cancel();
        throw new ResearchProviderError("response_too_large");
      }
      text += decoder.decode(part.value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new ResearchProviderError("invalid_response");
  }
}

async function requestPage(signal: AbortSignal, query: URLSearchParams) {
  try {
    return await request("/v1/web/scrape/markdown", signal, undefined, query);
  } catch (error) {
    signal.throwIfAborted();
    const transient = error instanceof ResearchProviderError
      ? error.reason === "unavailable" && [408, 502, 503, 504].includes(error.httpStatus ?? 0)
      : error instanceof TypeError || (error instanceof Error && error.name === "TimeoutError");
    if (!transient) throw error;
    console.warn(JSON.stringify({
      event: "solution_research.page_retry",
      reason: error instanceof ResearchProviderError ? error.reason : error instanceof Error ? error.name : "unavailable",
      httpStatus: error instanceof ResearchProviderError ? error.httpStatus : undefined,
      attempt: 2,
    }));
    await delay(500, undefined, { signal });
    signal.throwIfAborted();
    return request("/v1/web/scrape/markdown", signal, undefined, query);
  }
}

export const publicSearchResultSchema = z.object({
  url: z.url().max(2000),
  title: z.string().max(300),
  description: z.string().max(500),
});
const searchResponse = z.object({
  results: z
    .array(
      z.object({
        url: z.url().max(2000),
        title: z.string().max(2000),
        description: z.string().max(20000).optional(),
      }),
    )
    .max(100),
  partial: z.boolean().optional(),
});
export async function searchPublicSources(query: string, signal: AbortSignal) {
  const parsed = searchResponse.safeParse(
    await request("/v1/web/search", signal, { query, numResults: 10 }),
  );
  if (!parsed.success || parsed.data.partial)
    throw new ResearchProviderError("invalid_response");
  return parsed.data.results
    .filter((item) => publicResearchUrl(item.url))
    .slice(0, 10)
    .map((item) =>
      publicSearchResultSchema.parse({
        url: item.url,
        title: item.title.slice(0, 300),
        description: (item.description || "").slice(0, 500),
      }),
    );
}

const pageResponse = z.object({
  success: z.literal(true),
  url: z.url(),
  markdown: z.string().min(100).max(1_000_000),
  finalDOMState: z.string().optional(),
  partial: z.boolean().optional(),
  metadata: z
    .object({
      finalUrl: z.url().optional(),
      title: z.string().max(2000).optional(),
    })
    .optional(),
});
export async function readPublicSource(url: string, signal: AbortSignal) {
  if (!publicResearchUrl(url))
    throw new ResearchProviderError("invalid_response");
  const query = new URLSearchParams({
    url,
    useMainContentOnly: "true",
    includeHTML: "false",
    includeImages: "false",
    maxAgeMs: "0",
  });
  const parsed = pageResponse.safeParse(
    await requestPage(signal, query),
  );
  if (
    !parsed.success ||
    parsed.data.partial ||
    parsed.data.finalDOMState === "still-loading"
  )
    throw new ResearchProviderError("invalid_response");
  const finalUrl = parsed.data.metadata?.finalUrl || parsed.data.url;
  if (!publicResearchUrl(finalUrl))
    throw new ResearchProviderError("invalid_response");
  const sources = extractSources(
    {
      success: true,
      url: finalUrl,
      title: parsed.data.metadata?.title?.slice(0, 300),
      markdown: parsed.data.markdown,
    },
    new Date().toISOString(),
  );
  const source = sources[0];
  if (!source) throw new ResearchProviderError("invalid_response");
  return {
    source,
    truncated: parsed.data.markdown.length > source.excerpt.length,
  };
}
