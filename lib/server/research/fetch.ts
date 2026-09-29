import { lookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import type { IncomingHttpHeaders } from "node:http";
import { Readable } from "node:stream";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";
import ipaddr from "ipaddr.js";
import { HttpFailure } from "../../contracts/http";
import { researchLimits } from "../../contracts/research";

export type PublicTarget = { url: URL; hostname: string; address: string;
  family: 4 | 6 };
export type FetchResponse = { status: number; headers: IncomingHttpHeaders;
  body: AsyncIterable<Uint8Array> };
export type PublicFetchTransport = (target: PublicTarget,
  signal: AbortSignal) => Promise<FetchResponse>;
export type PublicResolver = (hostname: string) => Promise<Array<{ address: string;
  family: number }>>;

export function publicAddress(address: string): boolean {
  if (!ipaddr.isValid(address)) return false;
  const parsed = ipaddr.parse(address);
  if (parsed instanceof ipaddr.IPv6) {
    if (parsed.isIPv4MappedAddress()) return publicAddress(parsed.toIPv4Address().toString());
    if (!parsed.match(ipaddr.parseCIDR("2000::/3"))) return false;
  }
  return parsed.range() === "unicast";
}

export function parsePublicUrl(value: string): URL {
  let url: URL;
  try { url = new URL(value); }
  catch { throw new HttpFailure(422,"blocked_url","Public HTTPS URL required"); }
  const literalHost = url.hostname.replace(/^\[/,"").replace(/\]$/,"");
  if (url.protocol !== "https:" || url.username || url.password ||
      (url.port && url.port !== "443") || url.hash ||
      (ipaddr.isValid(literalHost) && !publicAddress(literalHost)) ||
      url.hostname.length > 253 || url.hostname.endsWith(".local") ||
      url.hostname.endsWith(".internal") || url.hostname === "localhost" ||
      url.hostname.endsWith(".localhost") || url.hostname.endsWith(".test") ||
      url.hostname.endsWith(".invalid") || url.hostname.endsWith(".example")) {
    throw new HttpFailure(422,"blocked_url","Public HTTPS URL required");
  }
  return url;
}

export async function resolvePublicTarget(value: string,
  resolve: PublicResolver = async (hostname) => lookup(hostname,{ all: true,verbatim: true })):
  Promise<PublicTarget> {
  const url = parsePublicUrl(value);
  const hostname = url.hostname;
  const literalHost = hostname.replace(/^\[/,"").replace(/\]$/,"");
  if (ipaddr.isValid(literalHost)) {
    return { url,hostname,address: literalHost,
      family: ipaddr.parse(literalHost).kind() === "ipv4" ? 4 : 6 };
  }
  let answers: Array<{ address: string; family: number }>;
  try { answers = await resolve(hostname); }
  catch { throw new HttpFailure(503,"dns_unavailable","Public destination unavailable"); }
  if (!answers.length || answers.length > 20 ||
      answers.some((answer) => ![4,6].includes(answer.family) ||
        !publicAddress(answer.address))) {
    throw new HttpFailure(422,"blocked_url","Public destination required");
  }
  const selected = answers[0];
  return { url,hostname,address: selected.address,family: selected.family as 4 | 6 };
}

export const pinnedHttpsTransport: PublicFetchTransport = (target,signal) =>
  new Promise((resolve,reject) => {
    const request = httpsRequest({ protocol: "https:",hostname: target.hostname,
      port: 443,path: `${target.url.pathname}${target.url.search}`,method: "GET",
      family: target.family,
      servername: target.hostname,rejectUnauthorized: true,signal,
      lookup: (_hostname,_options,callback) => callback(null,target.address,target.family),
      headers: { Host: target.hostname,Accept: "text/html,text/plain,application/xhtml+xml",
        "Accept-Encoding": "gzip,deflate,br", "User-Agent": "TurasPublicResearch/1.0" } },
    (response) => resolve({ status: response.statusCode ?? 0,
      headers: response.headers,body: response }));
    request.once("error",reject);
    request.end();
  });

function header(headers: IncomingHttpHeaders,key: string): string {
  const value = headers[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

async function boundedBody(body: AsyncIterable<Uint8Array>,encoding: string,
  remaining: number): Promise<Uint8Array> {
  let compressed = 0;
  const counted = async function* () {
    for await (const chunk of body) {
      compressed += chunk.byteLength;
      if (compressed > researchLimits.bytesPerDocument ||
          compressed > remaining) throw new HttpFailure(413,"document_too_large","Public page too large");
      yield chunk;
    }
  };
  let stream: Readable = Readable.from(counted());
  if (encoding === "gzip") stream = stream.pipe(createGunzip());
  else if (encoding === "deflate") stream = stream.pipe(createInflate());
  else if (encoding === "br") stream = stream.pipe(createBrotliDecompress());
  else if (encoding && encoding !== "identity") {
    throw new HttpFailure(415,"unsupported_encoding","Public page encoding unavailable");
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of stream) {
    const bytes = Buffer.from(chunk);
    size += bytes.byteLength;
    if (size > researchLimits.bytesPerDocument || size > remaining) {
      stream.destroy();
      throw new HttpFailure(413,"document_too_large","Public page too large");
    }
    chunks.push(bytes);
  }
  return Buffer.concat(chunks);
}

export async function fetchPublicDocument(value: string,options: {
  resolve?: PublicResolver; transport?: PublicFetchTransport;
  remainingBytes?: number; deadline?: Date;
} = {}) {
  const started = Date.now();
  const timeout = Math.min(researchLimits.fetchTimeoutMs,
    options.deadline ? options.deadline.getTime()-started : researchLimits.fetchTimeoutMs);
  if (timeout <= 0) throw new HttpFailure(503,"deadline_exceeded","Research deadline exceeded");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(),timeout);
  let current = value;
  const aliases: string[] = [];
  let spent = 0;
  const totalBudget = Math.min(options.remainingBytes ?? researchLimits.bytesPerRun,
    researchLimits.bytesPerRun);
  try {
    for (let redirect = 0; redirect <= researchLimits.redirectsPerFetch; redirect += 1) {
      const target = await resolvePublicTarget(current,options.resolve);
      const response = await (options.transport ?? pinnedHttpsTransport)(target,controller.signal);
      const declaredLength = Number(header(response.headers,"content-length"));
      if (Number.isFinite(declaredLength) && declaredLength >
          Math.min(researchLimits.bytesPerDocument,totalBudget-spent)) {
        throw new HttpFailure(413,"document_too_large","Public page too large");
      }
      if ([301,302,303,307,308].includes(response.status)) {
        if (redirect === researchLimits.redirectsPerFetch) {
          throw new HttpFailure(422,"redirect_limit","Too many public redirects");
        }
        const location = header(response.headers,"location");
        if (!location) throw new HttpFailure(422,"blocked_url","Public redirect unavailable");
        const redirectBody = await boundedBody(response.body,
          header(response.headers,"content-encoding").toLowerCase(),totalBudget-spent);
        spent += redirectBody.byteLength;
        aliases.push(target.url.toString());
        current = new URL(location,target.url).toString();
        parsePublicUrl(current);
        continue;
      }
      if ([401,403,429].includes(response.status)) {
        throw new HttpFailure(503,"access_blocked","Public source denied access");
      }
      if (response.status !== 200) {
        throw new HttpFailure(503,"fetch_unavailable","Public source unavailable");
      }
      const type = header(response.headers,"content-type").toLowerCase().split(";",1)[0].trim();
      if (!["text/html","text/plain","application/xhtml+xml"].includes(type)) {
        throw new HttpFailure(415,"unsupported_media","Public source format unavailable");
      }
      const body = await boundedBody(response.body,header(response.headers,"content-encoding").toLowerCase(),
        totalBudget-spent);
      let text: string;
      try { text = new TextDecoder("utf-8",{ fatal: true }).decode(body); }
      catch { throw new HttpFailure(415,"unsupported_encoding","Public source text unavailable"); }
      return { requestedUrl: value,canonicalUrl: target.url.toString(),aliases,
        contentType: type,bodyDigest: (await import("node:crypto")).createHash("sha256")
          .update(body).digest("hex"),text,rawBody: body,
        bytes: spent+body.byteLength,retrievedAt: new Date() };
    }
    throw new HttpFailure(422,"redirect_limit","Too many public redirects");
  } catch (error) {
    if (controller.signal.aborted) throw new HttpFailure(503,"fetch_timeout","Public fetch timed out");
    throw error;
  } finally { clearTimeout(timer); }
}
