const productCatalog = [
  { label: "Next.js", aliases: ["next.js", "nextjs"] },
  { label: "AI SDK", aliases: ["ai sdk", "ai-sdk"] },
  { label: "Sandbox", aliases: ["vercel sandbox", "vercel sandboxes"] },
  { label: "Fluid Compute", aliases: ["fluid compute"] },
  { label: "Edge Config", aliases: ["edge config"] },
  { label: "Vercel Firewall", aliases: ["vercel firewall"] },
  { label: "Analytics", aliases: ["vercel analytics"] },
  { label: "Speed Insights", aliases: ["speed insights"] },
  { label: "AI Gateway", aliases: ["ai gateway"] },
  { label: "Workflows", aliases: ["vercel workflows", "workflow sdk"] },
  { label: "Queues", aliases: ["vercel queues"] },
  { label: "Blob", aliases: ["vercel blob"] },
  { label: "Connect", aliases: ["vercel connect"] },
  { label: "Flags", aliases: ["vercel flags"] },
  { label: "v0", aliases: ["v0"] },
] as const;

function mentions(corpus: string, alias: string) {
  const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(corpus);
}

export function productsFromResearch(items: ReadonlyArray<{ title: string; quote: string }>) {
  const corpus = items.map((item) => `${item.title}\n${item.quote}`).join("\n");
  const listedNext=[...corpus.matchAll(/\b(?:tech(?:nology)?\s+)?stack\s*:\s*([^\r\n]{1,500})/gi)]
    .some(match=>match[1].split(',').some(item=>item.trim().replace(/[.;]$/,'').toLowerCase()==='next'));
  return productCatalog
    .filter((product) => product.aliases.some((alias) => mentions(corpus, alias)) ||
      product.label === "Next.js" && listedNext)
    .map((product) => product.label);
}
