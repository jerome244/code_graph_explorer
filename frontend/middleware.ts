// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(_req: NextRequest) {
  return NextResponse.next(); // nothing is protected
}

export const config = {
  matcher: ["/((?!_next|favicon.ico).*)"],
};
