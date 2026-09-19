import { identityFromRequest, type AppIdentity } from "./session";

export async function requireIdentity(request: Request): Promise<AppIdentity> {
  const identity = await identityFromRequest(request);
  if (!identity) throw new Response("Unauthorized", { status: 401, headers: { "cache-control": "no-store" } });
  return identity;
}

export function safeReturnPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/portfolio";
  return value;
}
