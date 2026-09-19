import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { identityFromHeaders, type AppIdentity } from "./session";

export async function requirePageIdentity(returnTo: string): Promise<AppIdentity> {
  const identity = await identityFromHeaders(await headers());
  if (!identity) redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  return identity;
}
