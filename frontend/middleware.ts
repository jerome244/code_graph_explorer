import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROTECTED_PATHS = ["/dashboard"]; // add more if you want

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const access = req.cookies.get("access")?.value;

  const needsAuth = PROTECTED_PATHS.some(p => pathname === p || pathname.startsWith(p + "/"));

  if (needsAuth && !access) {
    const url = req.nextUrl.clone();
    urlpathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next|favicon.ico|assets|.*\\.).*)"],
};
