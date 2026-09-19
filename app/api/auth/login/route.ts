import { NextResponse } from "next/server";
import { configuredIdentity, createSessionToken, registerSession, sessionCookie } from "@/lib/auth/session";
import { safeReturnPath } from "@/lib/auth/authorize";
import { sessionFailureDiagnostic } from "@/lib/auth/diagnostics";

export async function POST(request: Request) {
  const form = await request.formData();
  const username = String(form.get("username") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const returnTo = safeReturnPath(String(form.get("returnTo") ?? ""));
  const identity = configuredIdentity(username, password);
  if (!identity) return NextResponse.redirect(new URL(`/login?error=invalid&returnTo=${encodeURIComponent(returnTo)}`, request.url), 303);
  let token: string;
  let phase = "sign_session";
  try {
    token = await createSessionToken(identity);
    phase = "register_session";
    await registerSession(identity);
  } catch (error) {
    // Database/provider errors can contain credentials. Log only safe context.
    console.error(JSON.stringify({ event: "auth.session_creation_failed", requestId: request.headers.get("x-vercel-id") ?? crypto.randomUUID(), phase, ...sessionFailureDiagnostic(error) }));
    return NextResponse.redirect(new URL(`/login?error=unavailable&returnTo=${encodeURIComponent(returnTo)}`, request.url), 303);
  }
  const response = NextResponse.redirect(new URL(returnTo, request.url), 303);
  response.headers.set("set-cookie", sessionCookie(token));
  return response;
}
