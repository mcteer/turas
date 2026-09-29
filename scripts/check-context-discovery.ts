import { discoverContext } from "../lib/server/research/discovery";
import { fetchPublicDocument } from "../lib/server/research/fetch";
import { exactPublicPassage,normalizePublicDocument,
  passageSupportsResearchScope } from "../lib/server/research/normalize";

if (!process.argv.includes("--live")) throw new Error("Explicit --live admission required");
const key = process.env.CONTEXT_API_KEY;
if (!key?.trim()) throw new Error("Context.dev discovery key unavailable");
const result = await discoverContext('site:vercel.com/docs "build cache"',key);
if (!result.requestId || result.results.length < 1 || result.results.length > 5 ||
    result.results.some((item) => new URL(item.url).hostname !== "vercel.com")) {
  throw new Error("Context.dev discovery response failed policy check");
}
let publicPagesFetched = 0;
let exactQuote = false;
if (process.argv.includes("--fetch")) {
  for (const item of result.results) {
    const url = new URL(item.url);
    if (url.hostname !== "vercel.com" || !url.pathname.startsWith("/docs/")) continue;
    try {
      const fetched = await fetchPublicDocument(item.url);
      const normalized = normalizePublicDocument(fetched.text,fetched.contentType);
      const quote = exactPublicPassage(normalized.text,"build cache");
      exactQuote = normalized.text.includes(quote.text) &&
        passageSupportsResearchScope(quote.text,"practices",
          { product: "Vercel",topic: "build cache" });
      if (!exactQuote) continue;
      publicPagesFetched = 1;
      break;
    } catch { /* Try another public documentation result within the five URL cap. */ }
  }
  if (!exactQuote) throw new Error("Independent public fetch/quote check failed");
}
console.log(JSON.stringify({ provider: "Context.dev",live: true,
  publicResultCount: result.results.length,requestReceiptPresent: true,
  publicPagesFetched,exactQuote,pageContentUsedAsEvidence: false }));
