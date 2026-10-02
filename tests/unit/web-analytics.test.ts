import { describe, expect, it } from "vitest";
import { redactAnalyticsEvent } from "../../lib/web-analytics";

describe("web analytics privacy", () => {
  it("removes customer, engagement and conversation identifiers and URL secrets", () => {
    for (const [path, expected] of [
      ["/customers/private-customer/engagements/private-engagement/staffing", "/customers/[customerId]/engagements/[engagementId]/staffing"],
      ["/s/private-conversation", "/s/[conversationId]"],
      ["/staffing/imports/private-import", "/staffing/imports/[id]"],
    ]) {
      const result = redactAnalyticsEvent({ type: "pageview", url: `https://user:password@example.com${path}?token=secret#private` });
      expect(decodeURI(result!.url)).toBe(`https://example.com${expected}`);
    }
  });
  it("keeps ordinary page counts and drops unknown routes and custom events", () => {
    expect(redactAnalyticsEvent({ type: "pageview", url: "https://example.com/staffing?search=private" })?.url).toBe("https://example.com/staffing");
    expect(redactAnalyticsEvent({ type: "pageview", url: "https://example.com/unrecognized/private" })).toBeNull();
    expect(redactAnalyticsEvent({ type: "event", url: "https://example.com/" })).toBeNull();
    expect(redactAnalyticsEvent({ type: "pageview", url: "invalid" })).toBeNull();
  });
});
