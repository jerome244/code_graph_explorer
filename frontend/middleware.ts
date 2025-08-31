import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Only protect truly private pages. Graph & Games are PUBLIC.
const PROTECTED_PATHS = ["/dashboard"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const needsAuth = PROTECTED_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );

  if (needsAuth) {
    const access = req.cookies.get("access")?.value;
    if (!access) {
      const url = req.nextUrl.clone();
      url.pathname = "/";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next|favicon.ico|assets|.*\\.).*)"],
};
