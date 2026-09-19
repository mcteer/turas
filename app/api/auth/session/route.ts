import { NextResponse } from "next/server";
import { identityFromRequest } from "@/lib/auth/session";
export async function GET(request: Request) {
  const identity = await identityFromRequest(request);
  return NextResponse.json({ authenticated: Boolean(identity), identity: identity ? { username: identity.username, role: identity.role } : null }, { headers: { "cache-control": "no-store" } });
}
