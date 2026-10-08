import type { readSupportWorkspace, supportRevisionView } from "../../../lib/server/support/projection";
import type { SupportAction, SupportAssessment } from "../../../lib/contracts/support";
import type { SupportSource } from "../../../lib/server/support/schema";

export type SupportWorkspaceData = Awaited<ReturnType<typeof readSupportWorkspace>>;
export type SupportRevision = Awaited<ReturnType<typeof supportRevisionView>>;
export type SupportSession = { principal: { id: string; loginName: string }; membership: { id: string; kind: string; role: string }; csrfToken: string };
export type SupportFormProps = { sources: SupportSource[]; busy: boolean;
  onSave: (content: SupportAssessment | SupportAction) => Promise<void> };
export const supportLabel = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, letter => letter.toUpperCase());
export function supportDates() {
  const now = new Date(), review = new Date(now.getTime() + 7 * 86400000);
  return { observationDate: now.toISOString().slice(0, 10), nextReviewDate: review.toISOString().slice(0, 10), timezone: "UTC" };
}
