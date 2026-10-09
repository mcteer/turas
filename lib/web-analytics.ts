import type { BeforeSendEvent } from "@vercel/analytics/next";

/** Send route categories only; customer IDs, conversation IDs and queries stay private. */
export function redactAnalyticsEvent(event: BeforeSendEvent): BeforeSendEvent | null {
  if (event.type !== "pageview") return null;
  try {
    const url = new URL(event.url);
    const routes: [RegExp, string][] = [
      [/^\/product-gaps\/reports\/[^/]+\/?$/, "/product-gaps/reports/[reportId]"],
      [/^\/product-gaps\/(reports|new)\/?$/, "/product-gaps/$1"],
      [/^\/product-gaps\/[^/]+\/?$/, "/product-gaps/[gapId]"],
      [/^\/product-gaps\/?$/, "/product-gaps"],
      [/^\/customers\/[^/]+\/product-gaps\/?$/, "/customers/[customerId]/product-gaps"],
      [/^\/customers\/[^/]+\/engagements\/[^/]+\/staffing\/?$/, "/customers/[customerId]/engagements/[engagementId]/staffing"],
      [/^\/customers\/[^/]+\/engagements\/[^/]+\/?$/, "/customers/[customerId]/engagements/[engagementId]"],
      [/^\/customers\/[^/]+\/plans\/new\/?$/, "/customers/[customerId]/plans/new"],
      [/^\/customers\/[^/]+\/plans\/[^/]+\/?$/, "/customers/[customerId]/plans/[planId]"],
      [/^\/customers\/[^/]+\/(review|plans)\/?$/, "/customers/[customerId]/$1"],
      [/^\/customers\/[^/]+\/?$/, "/customers/[customerId]"],
      [/^\/staffing\/(resources|imports)\/[^/]+\/?$/, "/staffing/$1/[id]"],
      [/^\/s\/[^/]+\/?$/, "/s/[conversationId]"],
      [/^\/(?:customers|knowledge|s|login|admin\/access|staffing(?:\/(?:finance|imports|resources))?)?\/?$/, "$&"],
    ];
    const match = routes.find(([pattern]) => pattern.test(url.pathname));
    if (!match) return null;
    url.pathname = url.pathname.replace(match[0], match[1]);
    url.search = "";
    url.hash = "";
    url.username = "";
    url.password = "";
    return { ...event, url: url.toString() };
  } catch {
    return null;
  }
}
