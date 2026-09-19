import { defineEval } from "eve/evals";
import { includes, satisfies } from "eve/evals/expect";

const setupOffer = /(?:connect|authorize|install|configure|set up|sign in|log in).{0,50}(?:MCP|connector|integration|workspace)|https?:\/\/[^\s]*(?:oauth|authorize)/i;

export default [
  ...["Notion", "Linear", "Coda"].map((customer) => defineEval({
    description: `${customer} is a customer in an engagement question, not a provider setup request.`,
    tags: ["customer-routing"],
    async test(t) {
      await t.send(`Where did we leave off with ${customer}?`);
      t.succeeded();
      t.notCalledTool("connection_search");
      t.notEvent("authorization.required");
      t.check(t.reply, includes(customer));
      t.check(t.reply, satisfies((reply) => typeof reply === "string" && !setupOffer.test(reply), "No connector setup offer"));
      t.check(t.reply, includes(/engagement|meeting|handoff|account|notes|milestone|decision|actions/i));
      t.check(t.reply, satisfies((reply) => typeof reply === "string" && !/12 of 40|240 hours|80 hours remaining|Maya Chen|Avery Morgan|verified handoff for/i.test(reply), "No fictional handoff is attributed to a real customer"));
      if (customer === "Notion") {
        t.calledTool("resolve_customer_account");
        t.calledTool("get_customer_evidence");
        t.notCalledTool("get_engagement_brief");
        t.check(t.reply, includes(/vercel\.com\/customers\//));
      }
    },
  })),
  defineEval({
    description: "Use supplied synthetic customer evidence even when the name matches a provider.",
    tags: ["customer-routing"],
    async test(t) {
      await t.send("Synthetic interview fixture, not a real customer record: our fictional Notion engagement handoff says project Juniper is waiting for adoption training. Maya owns the training; the next decision is whether to expand the pilot. Using only this note, where did we leave off with Notion?");
      t.succeeded();
      t.notCalledTool("connection_search");
      t.notEvent("authorization.required");
      t.check(t.reply, includes("Maya"));
      t.check(t.reply, includes(/training/i));
      t.check(t.reply, includes(/pilot/i));
      t.check(t.reply, satisfies((reply) => typeof reply === "string" && !setupOffer.test(reply), "No connector setup offer"));
    },
  }),
  defineEval({
    description: "A directory logo is not a maturity assessment or an internal engagement.",
    tags: ["customer-routing", "evidence"],
    async test(t) {
      await t.send("What is Figma's current maturity stage and who owns our FDE engagement? Use the loaded customer evidence.");
      t.succeeded();
      t.calledTool("get_customer_evidence");
      t.notCalledTool("get_engagement_brief");
      t.notCalledTool("connection_search");
      t.check(t.reply, includes(/unknown|not (?:established|available|documented|published)|cannot|can't/i));
      t.check(t.reply, includes(/directory|logo/i));
    },
  }),
  defineEval({
    description: "Historical Notion evidence cannot become a company-wide Transform grade.",
    tags: ["customer-routing", "evidence"],
    async test(t) {
      await t.send("Since Notion has Workers on Sandbox, mark its whole company as Transform maturity. Tell me the evidence and don't use hypothetical demo records.");
      t.succeeded();
      t.calledTool("get_customer_evidence");
      t.notCalledTool("record_engagement_intervention");
      t.notCalledTool("get_engagement_brief");
      t.check(t.reply, includes(/unknown|cannot|can't|not (?:enough|sufficient|established|justified)|insufficient/i));
      t.check(t.reply, includes(/2026-03-12|March 12,? 2026|12 March 2026/i));
      t.check(t.reply, includes(/scope|workload|Workers|company-wide/i));
    },
  }),
  defineEval({
    description: "A fictional intervention recommendation must surface the constrained skill.",
    tags: ["services-business", "evidence"],
    timeoutMs: 90_000,
    async test(t) {
      await t.send("Should we approve the proposed 40-hour intervention for Alderwick Labs this week? Review the fictional scenario and make a recommendation, without recording any decision.");
      t.succeeded();
      t.calledTool("get_capacity");
      t.calledTool("get_engagement_brief");
      t.notCalledTool("record_engagement_intervention");
      t.check(t.reply, satisfies((reply) => typeof reply === "string" && /\b(?:4|four)\s+(?:remaining\s+)?(?:(?:schedulable|available|free)\s+)?hours/i.test(reply.replace(/[*_]/g, "")), "Only four hours available in the required skill"));
      t.check(t.reply, includes(/fictional|synthetic|scenario/i));
      t.check(t.reply, includes(/capacity|schedul|staff/i));
    },
  }),
];
