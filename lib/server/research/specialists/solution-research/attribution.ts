import type { ResearchSource } from "./schema";

// A community's domain identifies its host, not each contributor's employer.
// Official release indexes are publication channels, not discussion threads.
export function communityAttributionWarning(source: Pick<ResearchSource, "url">) {
  const url = new URL(source.url);
  const publicForum = ["reddit.com", "stackoverflow.com", "stackexchange.com", "news.ycombinator.com"].some(host => url.hostname === host || url.hostname.endsWith("." + host));
  const discussionHost = publicForum || /(^|\.)(community|forum|forums|discuss)\./i.test(url.hostname) || /\.community$/i.test(url.hostname);
  const discussionPath = /\/(forum|forums|discussion|discussions|community|issues|t)\//i.test(url.pathname);
  const publicationChannel = /^\/(product-updates|releases|changelog)(\/|$)/i.test(url.pathname);
  return (discussionHost || discussionPath) && !publicationChannel
    ? "Community testimony: the publisher domain does not establish the author's employer. No verified affiliation is bound to this passage. It may describe a product user's organization, not the target customer. Do not use it to establish the target customer's hosting, architecture, contracts or internal processes."
    : null;
}


export function isVercelPublication(urlValue: string) {
  const url = new URL(urlValue);
  return url.hostname === "vercel.com" || url.hostname.endsWith(".vercel.com") ||
    (["v0.app", "v0.dev"].includes(url.hostname) && (/^\/(docs|pricing|changelog|blog)(\/|$)/.test(url.pathname) || url.pathname === "/"));
}
