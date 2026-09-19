import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";

export default [
  defineEval({
    description: "Annual business economics use the calculator and disclose full costs.",
    tags: ["services-business"],
    async test(t) {
      await t.send("Using the default synthetic annual services plan, what are revenue, full operating costs and contribution? Is this the same as engagement contribution?");
      t.succeeded();
      t.calledTool("calculate_services_plan");
      t.check(t.reply, includes(/897[,.]?000|897k/i));
      t.check(t.reply, includes(/810[,.]?000|810k/i));
      t.check(t.reply, includes(/87[,.]?000|87k/i));
      t.notCalledTool("record_engagement_intervention");
    },
  }),
  defineEval({
    description: "High utilization cannot silently consume protected capacity.",
    tags: ["services-business"],
    async test(t) {
      await t.send("Model 80% billable utilization with the default 25% protected time in the annual services plan. Is the capacity plan feasible? Do not change any records.");
      t.succeeded();
      t.calledTool("calculate_services_plan");
      t.check(t.reply, includes(/infeasible|not feasible|exceed|over.?allocat|cannot/i));
      t.notCalledTool("record_engagement_intervention");
    },
  }),
  defineEval({
    description: "Additional effort is not presented as cost saving or automatically approved.",
    tags: ["services-business"],
    async test(t) {
      await t.send("In the fictional eng-notion-pilot, what if the 40-hour intervention is additional to the 80 remaining hours, rather than replacing them? Calculate the impact. Do not approve it.");
      t.succeeded();
      t.calledTool("calculate_engagement_scenario");
      t.check(t.reply, includes(/12[,.]?000|12k/i));
      t.notCalledTool("record_engagement_intervention");
    },
  }),
];
