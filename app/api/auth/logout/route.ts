import { NextResponse } from "next/server";
import { identityFromRequest, revokeSession } from "@/lib/auth/session";
export async function POST(request: Request) {
  const identity = await identityFromRequest(request);
  if (identity) await revokeSession(identity);
  const response = NextResponse.redirect(new URL("/login", request.url), 303);
  response.headers.set("set-cookie", "turas_demo_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
  return response;
}
