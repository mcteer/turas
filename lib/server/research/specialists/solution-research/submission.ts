import { z } from "zod";
import { researchBriefSchema, researchSubmissionSchema, type ResearchSource } from "./schema";
import { researchPassages, verifiedPublicationDate } from "./source-integrity";

export function solutionCitationIssues(blockers: string[]) {
  return blockers.filter(blocker => /^(?:Unverified source (?:passage|quotation)|Unverified publication date|Publication date is after retrieval|Unsupported (?:citation|alternative citation)|Unknown customer evidence|Unverified process-impact input reference)/.test(blocker));
}

export function bindResearchSubmission(submission: z.infer<typeof researchSubmissionSchema>, sources: ResearchSource[]) {
  const blockers: string[] = [];
  const sourceSupport = submission.sourceSupport.map((support) => {
    const source = sources.find(item => item.id === support.sourceId);
    if (!support.passageId) return { ...support, quote: support.quote ?? "Unverified quotation", publishedAt: support.publishedAt ?? null };
    const passage = source && researchPassages(source).find(item => item.id === support.passageId);
    if (!passage) blockers.push(`Unverified source passage: ${support.sourceId}.`);
    return { ...support, quote: passage?.text ?? "Unverified passage reference", publishedAt: source ? verifiedPublicationDate(source) : null };
  });
  return { brief: researchBriefSchema.parse({ ...submission, sourceSupport }), blockers };
}
