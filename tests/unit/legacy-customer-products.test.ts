import assert from "node:assert/strict";
import { test } from "vitest";
import { productsFromResearch } from "../../lib/profiles/research-products";

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
});
