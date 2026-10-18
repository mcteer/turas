import assert from "node:assert/strict";
import { test } from "vitest";
import { productsFromResearch, couldMatchResearchProductLabel } from "../../lib/profiles/research-products";

test("research-derived products use named Vercel product terms and exclude the company name", () => {
  assert.deepEqual(
    productsFromResearch([{
      title: "WPP workload architecture",
      quote: "The team uses Next.js, AI SDK, Vercel Sandbox and AI Gateway.",
    }]),
    ["Next.js", "AI SDK", "Sandbox", "AI Gateway"],
  );
  assert.deepEqual(productsFromResearch([{ title: "WPP workflow", quote: "The customer has a workflow for publishing campaigns." }]), []);
  assert.deepEqual(productsFromResearch([{ title: "Unrelated page", quote: "Vercel is mentioned as the hosting company." }]), []);
  assert.deepEqual(productsFromResearch([{title:"Storefront rebuild",quote:"Tech stack: Next, React, Shopify, Sanity, Algolia."}]),["Next.js"]);
  assert.deepEqual(productsFromResearch([{title:"Storefront rebuild",quote:"Technology stack: Express.js, Next, React."}]),["Next.js"]);
  assert.deepEqual(productsFromResearch([{title:"Next steps",quote:"Our next deployment will review the stack and remaining steps."}]),[]);
});

test("inventory research scans depend on emitted-label substring matches, preserving ambiguous product queries", () => {
  for(const query of ['DoorDash','synthetic workload','Fixture Curated Product','AI-SDK'])
    assert.equal(couldMatchResearchProductLabel(query),false,query);
  for(const query of ['next','NEXT.JS','  ai sdk  ','vercel','box','work',''])
    assert.equal(couldMatchResearchProductLabel(query),true,query);
});
