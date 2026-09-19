import { DEMO_DATA } from "./fixtures";
import { capacityMetrics, engagementMetrics, METRIC_VERSION } from "./metrics";

export function resolveCustomerAccount(query: string) {
  const normalized = query.trim().toLowerCase();
  const matches = DEMO_DATA.customers.filter((customer) =>
    [customer.name, ...customer.aliases].some((name) => name.toLowerCase() === normalized),
  );
  if (matches.length === 1) return { status: "resolved" as const, account: matches[0] };
  if (matches.length > 1) return { status: "ambiguous" as const, candidates: matches.map(({ id, name }) => ({ id, name })) };
  return { status: "not_found" as const };
}

export function getEngagementBrief(id: string) {
  const engagement = DEMO_DATA.engagements.find((candidate) => candidate.id === id);
  if (!engagement) return null;
  return {
    ...engagement,
    customer: DEMO_DATA.customers.find((customer) => customer.id === engagement.accountId)!,
    metrics: engagementMetrics(engagement),
    metricVersion: METRIC_VERSION,
    dataVersion: DEMO_DATA.version,
    reportingDate: DEMO_DATA.reportingDate,
  };
}

export function getCapacity() {
  return DEMO_DATA.team.map((member) => ({ ...member, metrics: capacityMetrics(member) }));
}

export function getPortfolioSummary() {
  const metrics = DEMO_DATA.engagements.map((engagement) => engagementMetrics(engagement));
  const known = metrics.filter((metric): metric is Extract<typeof metric, { status: "known" }> => metric.status === "known");
  return {
    dataVersion: DEMO_DATA.version,
    reportingDate: DEMO_DATA.reportingDate,
    metricVersion: METRIC_VERSION,
    forecastRevenue: known.reduce((sum, metric) => sum + metric.feeForecast, 0),
    forecastContribution: known.reduce((sum, metric) => sum + metric.contribution, 0),
    capacity: getCapacity(),
    exceptions: DEMO_DATA.engagements.filter((engagement) => engagement.risk.startsWith("High") || engagement.risk.startsWith("Unknown")),
  };
}
