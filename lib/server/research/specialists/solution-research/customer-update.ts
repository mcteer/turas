import { z } from "zod";
import { accountIdSchema } from "../account-id";
import { researchSourceTypeSchema, type ResearchSource } from "./schema";
import { researchPassages, verifiedPublicationDate } from "./source-integrity";
import type { DiscoverySearch } from "./discovery";
import { releaseChronology, releaseChronologySchema, missingChronologyEntries } from "./release-chronology";

import { communityAttributionWarning, isVercelPublication } from "./attribution";

const coverageCheckSchema = z.object({
  status: z.enum(["checked", "unavailable", "not_applicable"]),
  sourceIds: z.array(z.string().min(1).max(100)).max(4),
  note: z.string().trim().min(10).max(500),
}).strict();
const discoveryCoverageSchema = coverageCheckSchema.extend({
  searchIds: z.array(z.string().min(1).max(200)).max(4).describe("Copy searchIds returned by searches with this coverage purpose. checked requires a successful open-web search and retained findings; a failed/empty search is an explicit gap, not proof of absence."),
});
export const customerUpdateCoverageSchema = z.object({
  release_history: coverageCheckSchema.extend({
    currentIndexSourceId: z.string().min(1).max(100).optional().describe("For checked release history, identify the retrieved current release/changelog index, with a retained finding establishing the latest entries reviewed. Historical release posts alone do not satisfy this check."),
  }),
  current_documentation: coverageCheckSchema,
  availability_and_pricing: coverageCheckSchema,
  operations_and_limits: coverageCheckSchema,
  employee_testimony: discoveryCoverageSchema.optional(),
  practitioner_experience: discoveryCoverageSchema.optional(),
}).strict();

export const customerUpdateSubmissionSchema = z.object({
  accountId: accountIdSchema,
  question: z.string().trim().min(5).max(500),
  findings: z.array(z.object({
    claim: z.string().trim().min(5).max(700),
    scope: z.string().trim().min(1).max(200),
    sourceId: z.string().max(100),
    passageId: z.string().max(120),
    supportingPassageIds: z.array(z.string().max(120)).max(2).optional(),
    publisherType: z.enum(["customer", "vercel", "other"]),
    sourceType: researchSourceTypeSchema.optional(),
  }).strict()).max(16),
  conflicts: z.array(z.string().max(500)).max(5),
  unknowns: z.array(z.string().max(500)).max(8),
  coverage: customerUpdateCoverageSchema.optional().describe("Report all six checks, including employee_testimony and practitioner_experience with returned searchIds. checked requires sources supporting retained findings; unavailable means a gap; not_applicable is only for an explicitly focused request, never a broad latest-state question. Omission produces a partial assessment."),
}).strict();
export const customerUpdateSchema = customerUpdateSubmissionSchema.extend({
  releaseChronology: releaseChronologySchema.optional(),
  findings: z.array(customerUpdateSubmissionSchema.shape.findings.element.extend({
    url: z.url(), title: z.string(), quote: z.string(),
    retrievedAt: z.iso.datetime(), publishedAt: z.iso.date().nullable(),
    attributionWarning: z.string().optional(),
  })).max(16),
});

// Binding proves retrieval and preserves exact source text; it does not prove entailment.
export function bindCustomerUpdate(
  submission: z.infer<typeof customerUpdateSubmissionSchema>, sources: ResearchSource[],
  discoverySearches: DiscoverySearch[] = [],
) {
  const blockers: string[] = [];
  const indexSource = sources.find(source => source.id === submission.coverage?.release_history.currentIndexSourceId);
  const chronology = indexSource ? releaseChronology(indexSource) : undefined;
  const findings = submission.findings.flatMap(finding => {
    const source = sources.find(source => source.id === finding.sourceId);
    const ids = [...new Set([finding.passageId, ...(finding.supportingPassageIds ?? [])])];
    const available = source ? researchPassages(source) : [];
    const passages = ids.flatMap(id => available.filter(passage => passage.id === id));
    if (!source || passages.length !== ids.length) {
      blockers.push(`Unverified source passage: ${finding.sourceId}/${finding.passageId}.`);
      return [];
    }
    const vercel = isVercelPublication(source.url);
    const attributionWarning = communityAttributionWarning(source);
    if (!attributionWarning && (finding.publisherType === "vercel") !== vercel) {
      blockers.push(`Publisher classification conflicts with source host: ${source.id}.`);
      return [];
    }
    if (attributionWarning) blockers.push(`Unverified community attribution for ${source.id}: this cannot establish the target customer's own deployment or processes.`);
    return [{ ...finding,
      ...(attributionWarning ? {
        publisherType: "other" as const,
        claim: "An unverified community author reports a product-use experience; the author's organization and relationship to the target customer are not established.",
        scope: "Community/product-user testimony only; not evidence of the target customer's own infrastructure or internal processes.",
        attributionWarning,
      } : {}), url: source.url, title: source.title, quote: passages.map(passage => passage.text).join("\n\n"),
      retrievedAt: source.retrievedAt, publishedAt: verifiedPublicationDate(source) }];
  });
  for (const publisher of ["customer", "vercel"])
    if (!findings.some(finding => finding.publisherType === publisher))
      blockers.push(`No retrieved ${publisher}-published evidence supports this update.`);
  if (!findings.length) blockers.push("No current public findings could be substantiated.");
  let coverage = submission.coverage;
  if (!coverage) blockers.push("Current-state source coverage was not assessed; this is a partial lookup.");
  else {
    for (const area of ["employee_testimony", "practitioner_experience"] as const)
      if (!coverage[area]) blockers.push(`Coverage gap for ${area}: discovery was not assessed.`);
    coverage = customerUpdateCoverageSchema.parse(Object.fromEntries(
    Object.entries(coverage).map(([area, check]) => {
      if ((area === "employee_testimony" || area === "practitioner_experience") && check.status === "checked") {
        const searchIds = submission.coverage?.[area]?.searchIds ?? [];
        if (!searchIds.length || searchIds.some(id => !discoverySearches.some(search => search.searchId === id && search.purpose === area && search.status === "found"))) {
          const note = `Coverage gap for ${area}: checked discovery is not supported by successful recorded searches of this kind.`;
          blockers.push(note);
          return [area, { ...check, status: "unavailable", note }];
        }
      }
      if ((area === "employee_testimony" || area === "practitioner_experience") && check.status === "checked") {
        const searchIds = submission.coverage?.[area]?.searchIds ?? [];
        const discoveredUrls = new Set(discoverySearches.filter(search => searchIds.includes(search.searchId) && search.purpose === area && search.status === "found").flatMap(search => search.urls));
        const eligibleTypes = area === "employee_testimony"
          ? ["conference_presentation", "webinar", "customer_publication", "independent_analysis"]
          : ["practitioner_report"];
        if (!findings.some(finding => check.sourceIds.includes(finding.sourceId) && discoveredUrls.has(finding.url) && finding.sourceType && eligibleTypes.includes(finding.sourceType))) {
          const note = `Coverage gap for ${area}: no relevant discovered testimony or firsthand account was read and retained. A search attempt or a quoted historical vendor statement does not complete this check.`;
          blockers.push(note);
          return [area, { ...check, status: "unavailable", note }];
        }
      }
      if (area === "release_history" && check.status === "checked") {
        const indexId = submission.coverage?.release_history.currentIndexSourceId;
        if (!indexId || !check.sourceIds.includes(indexId) || !findings.some(finding => finding.sourceId === indexId)) {
          const note = "Coverage gap for release_history: no retained current release/changelog index evidence. Historical posts alone do not establish latest release coverage.";
          blockers.push(note);
          return [area, { ...check, status: "unavailable", sourceIds: [], note }];
        }
        const missing = missingChronologyEntries(chronology, findings);
        if (missing.length) {
          const note = `Release chronology is incomplete: findings omit retrieved entries for ${missing.map(entry => entry.documentedBy).join(", ")}. The dated passages remain in releaseChronology; a later recap is not a first-availability date.`;
          blockers.push(note);
          return [area, { ...check, status: "unavailable", note }];
        }
      }
      if (check.status === "checked" && (!check.sourceIds.length || check.sourceIds.some(id => !findings.some(finding => finding.sourceId === id)))) {
        const note = `Coverage for ${area} lacks retrieved, retained supporting findings.`;
        blockers.push(note);
        return [area, { ...check, status: "unavailable", sourceIds: [], note }];
      }
      if (check.status === "unavailable") blockers.push(`Coverage gap for ${area}: ${check.note}`);
      return [area, check];
    }),
  ));
  }
  const update = customerUpdateSchema.parse({ ...submission, findings, ...(coverage ? { coverage } : {}), ...(chronology ? { releaseChronology: chronology } : {}) });
  const retained = sources.filter(source => source.id === chronology?.sourceId || findings.some(finding => finding.sourceId === source.id)).map(source => {
    const ids = new Set(findings.filter(finding => finding.sourceId === source.id).flatMap(finding => [finding.passageId, ...(finding.supportingPassageIds ?? [])]));
    if (chronology?.sourceId === source.id)
      for (const entry of chronology.entries) for (const id of [entry.datePassageId, ...entry.passages.map(passage => passage.id)]) ids.add(id);
    const retainedPassages = researchPassages(source).filter(passage => ids.has(passage.id));
    const quotes = retainedPassages.map(passage => passage.text);
    if (source.publication && !quotes.some(quote => quote.includes(source.publication?.quote ?? ""))) quotes.unshift(source.publication.quote);
    const excerpt = quotes.join("\n\n");
    return { ...source, retainedPassages, excerpt: excerpt.length > source.excerpt.length ? source.excerpt : excerpt };
  });
  return { update, sources: retained, blockers };
}

export function customerUpdateRevisionReasons(
  submission: z.infer<typeof customerUpdateSubmissionSchema>,
  bound: ReturnType<typeof bindCustomerUpdate>,
) {
  const reasons: string[] = [];
  if (bound.update.findings.length < submission.findings.length)
    reasons.push("Some findings failed source/passage or publisher validation. Correct their references using research_evidence or remove unsupported claims.");
  if (!submission.coverage) reasons.push("Report all six source-coverage checks, with explicit gaps where necessary.");
  else for (const [area, check] of Object.entries(submission.coverage)) {
    if (check.status !== "checked") continue;
    const missing = check.sourceIds.filter(id => !bound.update.findings.some(finding => finding.sourceId === id));
    if (!check.sourceIds.length || missing.length)
      reasons.push(`${area}: checked requires retained findings for every listed source. Missing: ${missing.join(", ") || "sourceIds"}. Retain supported findings, remove extraneous references and narrow the note, or mark the missing check unavailable.`);
  }
  const release = submission.coverage?.release_history;
  if (release?.status === "checked") {
    for (const entry of missingChronologyEntries(bound.update.releaseChronology, bound.update.findings))
      reasons.push(`Release chronology: retain a finding for ${entry.documentedBy} from ${bound.update.releaseChronology?.sourceId}, selecting one of ${entry.passages.map(passage => passage.id).slice(0, 3).join(", ")} and date passage ${entry.datePassageId}. Compare earlier and later mentions; use documented by, not first launched. These passages were already retrieved; do not search again.`);
  }
  if (release?.status === "checked" && (!release.currentIndexSourceId || !release.sourceIds.includes(release.currentIndexSourceId) || !bound.update.findings.some(finding => finding.sourceId === release.currentIndexSourceId)))
    reasons.push("release_history requires currentIndexSourceId and a retained finding from the current release/changelog index. If the index was not retrieved, mark this area unavailable rather than substituting historical posts.");
  for (const area of ["employee_testimony", "practitioner_experience"] as const) {
    const check = submission.coverage?.[area];
    if (!check || (check.status === "checked" && bound.update.coverage?.[area]?.status !== "checked"))
      reasons.push(`${area} requires recorded discovery searchIds and retained source findings. Use research_evidence to recover valid references; if discovery or retrieval was skipped, mark the coverage unavailable explicitly.`);
  }
  return reasons;
}
