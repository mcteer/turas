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
];
