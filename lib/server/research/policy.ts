import { conversationFeature } from "../conversations/feature";
import { isIP } from "node:net";
import type { PoolClient } from "pg";
import { HttpFailure, hiddenRecord } from "../../contracts/http";
import type { ResearchPreviewInput } from "../../contracts/research";
import type { CurrentSession } from "../auth/sessions";
import { lockOwnedBinding } from "../conversations/binding";
import { assertRetrievalReady } from "../retrieval/policy";

export const researchQueryTemplate = "public-research-v2" as const;

const secretLike = /(?:\b(?:password|secret|token|api[_-]?key|private[_-]?key)\s*[:=]|\b(?:sk|ghp|gho|github_pat|xox[baprs])[-_][A-Za-z0-9]{8,}|-----BEGIN\s+[^-]*PRIVATE KEY-----)/i;
const privateTopic = /\b(?:internal-only|confidential|customer contract|private repository|employee record|billing account)\b/i;

function safeField(value: string): string {
  const normalized = value.trim().normalize("NFC");
  if (secretLike.test(normalized) || privateTopic.test(normalized) ||
      /[\r\n\x00-\x1f]/.test(normalized) || /[<>]/.test(normalized)) {
    throw new HttpFailure(422,"public_scope_required","Use public research terms only");
  }
  return normalized;
}

function publicDomain(value: string): string {
  const domain = safeField(value).toLowerCase().replace(/\.$/,"");
  if (isIP(domain) || domain.length > 253 || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain) ||
      /(?:^|\.)(?:local|localhost|internal|test|invalid|example)$/.test(domain)) {
    throw new HttpFailure(422,"public_scope_required","Use a public domain");
  }
  return domain;
}

export function renderResearchQueries(input: ResearchPreviewInput): string[] {
  if (input.mode === "fit") return [];
  if (input.mode === "recon") {
    const domain = publicDomain(input.publicDomain);
    const name = safeField(input.publicName);
    return [`"${name}" "${domain}" company products architecture`,
      `"${name}" Vercel case study outcomes`,
      `"${name}" engineer conference webinar architecture`,
      `"${name}" product releases user experience limitations`];
  }
  const product = safeField(input.product);
  const version = safeField(input.version);
  const topic = safeField(input.topic);
  return [`"${product}" "${version}" "${topic}" official documentation`,
    `"${product}" "${topic}" implementation guidance`];
}

export async function lockResearchOwner(client: PoolClient,actor: CurrentSession,
  customerId: string,conversationId: string) {
  await assertRetrievalReady(client);
  const bound = await lockOwnedBinding(client,actor,conversationId);
  if ((await conversationFeature(client,conversationId)).kind !== "normal")
    throw new HttpFailure(409,"conversation_already_bound","Research requires its own conversation");
  if (bound.customer_id !== customerId || bound.binding_state !== "bound" ||
      !bound.eve_session_id) throw hiddenRecord();
  return bound;
}
