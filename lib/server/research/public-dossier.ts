import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { normalizePublicDocument } from "./normalize";

export const dossierAreas = ["identity", "vercel_relationship", "architecture_outcomes", "releases", "employee_testimony", "practitioner_experience"] as const;
export const dossierAreaSchema = z.enum(dossierAreas);
export const publicCustomerSchema = z.object({ name: z.string().trim().min(1).max(200),
  industries: z.array(z.string()).max(20), directoryListed: z.boolean(),
  stories: z.array(z.object({ url: z.url(), title: z.string() })).max(30),
  researchQualifier: z.string().trim().min(1).max(100).optional(),
  identitySources: z.array(z.url()).max(3).optional() });
export type PublicCustomer = z.infer<typeof publicCustomerSchema>;
export const publicDossierSchema = z.object({
  description: z.string().max(2000),
  findings: z.array(z.object({ area: dossierAreaSchema, statement: z.string().min(1).max(1500),
    sourceIndex: z.number().int().nonnegative().max(15), quote: z.string().min(40).max(1800),
    attribution: z.string().min(1).max(500), caveats: z.array(z.string().max(500)).max(8) })).max(24),
  coverage: z.array(z.object({ area: dossierAreaSchema, state: z.enum(["supported", "not_found", "unavailable", "incomplete"]),
    explanation: z.string().min(1).max(1000) })).length(6),
  unknowns: z.array(z.string().max(1000)).max(20),
}).strict();
export type PublicDossier = z.infer<typeof publicDossierSchema>;
export type CheckedPublicPage = { url: string; title: string; text: string; bodyDigest: string;
  normalizedDigest: string; retrievedAt: string; publishedAt: string | null; discoveryPurpose: string; fullNormalizedDigest?: string; receiptSignature?: string; textTruncated?: boolean; totalNormalizedCharacters?: number };
export const publicDigest = (value: string) => createHash("sha256").update(value).digest("hex");

/** This only establishes public subject relevance, never employer/workload ownership. */
export function publicSubjectMention(text: string, name: string): boolean {
  const normalize = (value: string) => value.normalize("NFKC").toLocaleLowerCase("en-US").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  return (` ${normalize(text)} `).includes(` ${normalize(name)} `);
}

export function validatePublicDossier(input: unknown, customer: PublicCustomer, pages: readonly CheckedPublicPage[]): PublicDossier {
  const dossier = publicDossierSchema.parse(input);
  if (new Set(dossier.coverage.map(item => item.area)).size !== dossierAreas.length) throw new Error("Duplicate dossier coverage");
  for (const finding of dossier.findings) {
    const source = pages[finding.sourceIndex];
    if (!source || !source.text.includes(finding.quote) || !publicSubjectMention(source.text, customer.name)) {
      throw new Error("Dossier quotation or subject is unsupported");
    }
    if (publicDigest(source.text) !== source.normalizedDigest) throw new Error("Dossier source changed");
  }
  for (const area of dossier.coverage) {
    if (area.state === "supported" && !dossier.findings.some(finding => finding.area === area.area)) throw new Error("Coverage requires retained findings");
  }
  return dossier;
}

export function checkedPublicPage(raw: { url: string; title: string; text: string; contentType: string;
  body: Uint8Array; retrievedAt: string; discoveryPurpose: string }): CheckedPublicPage {
  const normalized = normalizePublicDocument(raw.text, raw.contentType);
  // Only an explicit publisher date is stored. Retrieval never dates the event.
  const publication = raw.contentType === "text/html" ?
    raw.text.match(/<meta\b[^>]*(?:property|name)=["'](?:article:published_time|datePublished)["'][^>]*content=["']([^"']+)["']/i)?.[1] : undefined;
  const date = publication && !Number.isNaN(Date.parse(publication)) && Date.parse(publication) <= Date.now() ? new Date(publication).toISOString() : null;
  return { url: raw.url, title: raw.title.slice(0,160), text: normalized.text,
    bodyDigest: createHash("sha256").update(raw.body).digest("hex"), normalizedDigest: normalized.digest, fullNormalizedDigest: normalized.digest,
    retrievedAt: raw.retrievedAt, publishedAt: date, discoveryPurpose: raw.discoveryPurpose };
}

export function publicResearchQueries(customer: PublicCustomer): Array<{ purpose: string; query: string }> {
  const name = `"${customer.name.replaceAll('"', '')}"${customer.researchQualifier ? " " + customer.researchQualifier : ""}`;
  return [
    { purpose: "identity", query: `${name} official company products website` },
    { purpose: "vercel_relationship", query: `${name} Vercel customer architecture case study outcomes` },
    { purpose: "architecture_outcomes", query: `${name} engineering architecture performance deployment measured outcomes` },
    { purpose: "releases", query: `${name} official product releases changelog 2026` },
    { purpose: "employee_testimony", query: `${name} engineer CTO conference presentation webinar architecture` },
    { purpose: "practitioner_experience", query: `${name} product user experience limitations problems review firsthand` },
  ];
}

/** Capability proof is minted only by the server/operator fetch path, never by a model or upload. */
export function signCheckedPublicPage(page: CheckedPublicPage): CheckedPublicPage {
  const secret=process.env.TURAS_MAINTENANCE_SECRET;
  if(!secret || secret.length<32)throw new Error("Source signing configuration unavailable");
  const message=JSON.stringify({contract:"public-batch-source-v1",url:page.url,bodyDigest:page.bodyDigest,
    normalizedDigest:page.normalizedDigest,fullNormalizedDigest:page.fullNormalizedDigest??page.normalizedDigest,
    publishedAt:page.publishedAt,retrievedAt:page.retrievedAt,title:page.title,discoveryPurpose:page.discoveryPurpose});
  return {...page,receiptSignature:createHmac("sha256",secret).update(message).digest("hex")};
}
export function assertCheckedPublicPage(page: CheckedPublicPage): void {
  const signature=signCheckedPublicPage(page).receiptSignature!;
  if(!page.receiptSignature || !/^[a-f0-9]{64}$/.test(page.receiptSignature) ||
    !timingSafeEqual(Buffer.from(signature,"hex"),Buffer.from(page.receiptSignature,"hex")))throw new Error("Public fetch receipt signature is invalid");
  if(publicDigest(page.text)!==page.normalizedDigest || Date.parse(page.retrievedAt)>Date.now() ||
    Number.isNaN(Date.parse(page.retrievedAt)))throw new Error("Public fetch receipt content or date is invalid");
}

/** Treat a model draft as proposals: retain only the requested fields and checked quotes. */
export function normalizePublicDraft(raw: unknown, customer: PublicCustomer, pages: readonly CheckedPublicPage[]) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Public draft object required');
  const wrapper=raw as Record<string,unknown>;
  const candidate=wrapper.dossier && typeof wrapper.dossier==='object' && !Array.isArray(wrapper.dossier)
    ? wrapper.dossier as Record<string,unknown> : wrapper;
  if (!Array.isArray(candidate.findings)) throw new Error('Public draft findings required');
  const findings=candidate.findings.flatMap(proposal=>{
    const checked=publicDossierSchema.shape.findings.element.safeParse(proposal);
    if(!checked.success)return [];
    const page=pages[checked.data.sourceIndex];
    return page?.text.includes(checked.data.quote)&&publicSubjectMention(page.text,customer.name)?[checked.data]:[];
  }).slice(0,24);
  return {description:candidate.description,findings,unknowns:candidate.unknowns,
    coverage:dossierAreas.map(area=>{const count=findings.filter(f=>f.area===area).length;
      return {area,state:count?'supported':'not_found',explanation:count
        ? `This pass retained ${count} finding(s) supported by exact public passages; claims remain attributed.`
        : 'No supported finding was retained in this bounded research pass. This does not establish that evidence is absent.'};})};
}
