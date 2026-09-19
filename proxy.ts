import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/session";

export function proxy(request: NextRequest) {
  const protectedPath = request.nextUrl.pathname === "/" || request.nextUrl.pathname.startsWith("/s") || request.nextUrl.pathname.startsWith("/customers") || request.nextUrl.pathname.startsWith("/portfolio") || request.nextUrl.pathname.startsWith("/engagements") || request.nextUrl.pathname.startsWith("/memo") || request.nextUrl.pathname.startsWith("/operating-model");
  if (protectedPath && !request.cookies.get(SESSION_COOKIE)?.value) {
    const url = new URL("/login", request.url); url.searchParams.set("returnTo", `${request.nextUrl.pathname}${request.nextUrl.search}`); return NextResponse.redirect(url);
  }
  return NextResponse.next();
}
export const config = { matcher: ["/", "/s/:path*", "/portfolio/:path*", "/customers/:path*", "/engagements/:path*", "/memo/:path*", "/operating-model/:path*"] };
