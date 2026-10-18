import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { z } from "zod";
import type { ResearchSource } from "./schema";
import { publicationEvidence } from "./source-integrity";

export function publicResearchUrl(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      !url.search &&
      !url.hash &&
      host.includes(".") &&
      !isIP(host.replace(/^\[|\]$/g, "")) &&
      !/(^|\.)(localhost|local|internal|test|invalid|example|onion)$/.test(
        host,
      ) &&
      !/(^|\.)(nip\.io|sslip\.io|localtest\.me)$/.test(host)
    );
  } catch {
    return false;
  }
}

const pageSchema = z.object({
  url: z.string().max(2000),
  title: z.string().max(300).optional(),
  success: z.boolean().optional(),
  markdown: z.union([
    z.string(),
    z.object({
      markdown: z.string().nullable(),
      code: z.string(),
      finalDOMState: z.string().optional(),
    }),
  ]),
});
// Accept documented structured responses and MCP JSON text blocks. Search snippets
// alone are discovery hints, never retrieved source evidence.
export function extractSources(
  output: unknown,
  retrievedAt: string,
): ResearchSource[] {
  const sources = new Map<string, ResearchSource>();
  const visit = (value: unknown, depth = 0) => {
    if (depth > 5 || sources.size >= 8) return;
    if (typeof value === "string") {
      if (value.length > 1_000_000) return;
      try {
        visit(JSON.parse(value), depth + 1);
      } catch {
        /* Unstructured text is not verified retrieval. */
      }
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value.slice(0, 20)) visit(item, depth + 1);
      return;
    }
    const object = z.record(z.string(), z.unknown()).safeParse(value);
    if (
      !object.success ||
      object.data.isError === true ||
      object.data.partial === true ||
      object.data.finalDOMState === "still-loading"
    )
      return;
    const page = pageSchema.safeParse(value);
    if (
      page.success &&
      page.data.success !== false &&
      publicResearchUrl(page.data.url)
    ) {
      const markdown =
        typeof page.data.markdown === "string"
          ? page.data.markdown
          : page.data.markdown.code === "SUCCESS" &&
              page.data.markdown.finalDOMState !== "still-loading"
            ? page.data.markdown.markdown
            : null;
      if (markdown && markdown.trim().length >= 100) {
        const excerpt = markdown.slice(0, 16000);
        const id = `source-${createHash("sha256")
          .update(page.data.url + excerpt)
          .digest("hex")
          .slice(0, 16)}`;
        sources.set(id, {
          id,
          url: page.data.url,
          title: page.data.title || new URL(page.data.url).hostname,
          retrievedAt,
          excerpt,
          publication: publicationEvidence(excerpt),
        });
      }
    }
    for (const key of [
      "structuredContent",
      "content",
      "text",
      "results",
      "data",
    ])
      if (key in object.data) visit(object.data[key], depth + 1);
  };
  visit(output);
  return [...sources.values()];
}

export function researchCallAllowed(toolName: string, input: unknown) {
  const search = z
    .object({
      query: z
        .string()
        .trim()
        .min(3)
        .max(300)
        .refine(
          (query) =>
            !/https?:\/\/|@|\b(password|secret|token|api[_ -]?key)\s*[:=]|\bsk-[a-z0-9]{12}/i.test(
              query,
            ),
        ),
      numResults: z.number().int().min(10).max(10).optional(),
    })
    .strict();
  const scrape = z
    .object({
      url: z.string().refine(publicResearchUrl),
      useMainContentOnly: z.boolean().optional(),
    })
    .strict();
  return toolName === "context__web-search"
    ? search.safeParse(input).success
    : toolName === "context__web-scrape-markdown" &&
        scrape.safeParse(input).success;
}

export function researchLimits(mode?: "solution" | "customer-update" | "best-practices") {
  return mode === "customer-update" || mode === "best-practices" ? { search: 8, scrape: 12 } : { search: 6, scrape: 8 };
}

export function withinResearchBudget(
  calls: Record<string, "search" | "scrape">,
  callId: string,
  kind: "search" | "scrape",
  startedAt: number,
  now = Date.now(),
  mode?: "solution" | "customer-update" | "best-practices",
) {
  if (calls[callId]) return calls[callId] === kind;
  return (
    now - startedAt <= 8 * 60 * 1000 &&
    Object.values(calls).filter((call) => call === kind).length <
      researchLimits(mode)[kind]
  );
}
