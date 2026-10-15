import {createHash} from "node:crypto";
import {verifiedPublicationDate} from "./source-integrity";
import type {CheckedPublicPage} from "./public-dossier";
import {readPublicSource} from "./provider";
import {parsePublicUrl} from "./fetch";
import {researchLimits} from "../../contracts/research";
import {HttpFailure} from "../../contracts/http";
/** Legacy rendered-source reader adapted to the governed fetch receipt. */
export async function readPublicResearchDocument(url:string,options:{deadline?:Date}={}) {
 parsePublicUrl(url);
 const timeout=Math.min(researchLimits.fetchTimeoutMs,options.deadline?options.deadline.getTime()-Date.now():researchLimits.fetchTimeoutMs);
 if(timeout<=0)throw new HttpFailure(503,"deadline_exceeded","Research deadline exceeded");
 const fetched=await readPublicSource(url,AbortSignal.timeout(timeout));
 parsePublicUrl(fetched.source.url);
 return {requestedUrl:url,canonicalUrl:fetched.source.url,aliases:fetched.source.url===url?[]:[url],contentType:"text/plain",text:fetched.source.excerpt,
  rawBody:fetched.rawBody,bodyDigest:createHash("sha256").update(fetched.rawBody).digest("hex"),bytes:fetched.rawBody.length,
  retrievedAt:new Date(fetched.source.retrievedAt),title:fetched.source.title,truncated:fetched.truncated,publication:fetched.source.publication,publishedAt:verifiedPublicationDate(fetched.source)};
}

export function checkedRenderedPublicPage(fetched:Awaited<ReturnType<typeof readPublicResearchDocument>>,discoveryPurpose:string):CheckedPublicPage {
 const digest=createHash("sha256").update(fetched.text).digest("hex");
 return {url:fetched.canonicalUrl,title:fetched.title,text:fetched.text,bodyDigest:fetched.bodyDigest,normalizedDigest:digest,fullNormalizedDigest:digest,
  retrievedAt:fetched.retrievedAt.toISOString(),publishedAt:fetched.publishedAt?new Date(fetched.publishedAt).toISOString():null,
  discoveryPurpose,textTruncated:fetched.truncated,totalNormalizedCharacters:fetched.text.length};
}
