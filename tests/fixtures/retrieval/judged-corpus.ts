/** Fixed synthetic source text for the 005 judged retrieval queries. */
export const walkthroughClaimTexts = [
  "Checkout rollback rehearsal is complete.",
  "Checkout rollback rehearsal has not been completed.",
  "Public web release checklist has an assigned owner.",
  "Public web release review occurs before promotion.",
  "Commerce checkout uses a separate release approval step.",
  "Commerce checkout has a documented test environment.",
  "The synthetic team records deployment decisions.",
  "The synthetic team tracks release follow-up actions.",
  "The public web team shares a deployment checklist.",
  "The checkout team has requested rollback training.",
  "A delivery contact attends weekly release reviews.",
  "The synthetic team keeps an incident follow-up list.",
  "Checkout release ownership is under discussion.",
  "The public web workload has a named technical owner.",
  "The checkout workload has a named technical owner.",
  "The next release review includes rollback readiness.",
] as const;

export const walkthroughFieldTexts = {
  deploymentWorkflow: "Juniper's synthetic team has a documented deployment review workflow.",
  rollbackRisk: "Checkout rollback ownership is unresolved",
  publicWebUse: "Public web releases use a reviewed deployment path",
  checkoutEvaluation: "Commerce checkout is evaluating the deployment path",
  rollbackAction: "Confirm rollback owner and record rehearsal outcome",
  milestoneImpact: "A failed checkout release could interrupt the review milestone",
} as const;

export const judgedPassages = [
  ...walkthroughClaimTexts.slice(2),...Object.values(walkthroughFieldTexts),
] as const;

export const syntheticPublicResearchPassage =
  "A fictional platform documents deployment review checks and a published rollback procedure.";
