import { NextResponse } from "next/server";
import { configuredIdentity, createSessionToken, registerSession, sessionCookie } from "@/lib/auth/session";
import { safeReturnPath } from "@/lib/auth/authorize";

export async function POST(request: Request) {
  const form = await request.formData();
  const username = String(form.get("username") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const returnTo = safeReturnPath(String(form.get("returnTo") ?? ""));
  const identity = configuredIdentity(username, password);
  if (!identity) return NextResponse.redirect(new URL(`/login?error=invalid&returnTo=${encodeURIComponent(returnTo)}`, request.url), 303);
  await registerSession(identity);
  const response = NextResponse.redirect(new URL(returnTo, request.url), 303);
  response.headers.set("set-cookie", sessionCookie(await createSessionToken(identity)));
  return response;
}
