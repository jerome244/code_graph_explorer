import { NextResponse } from "next/server";

function clearAndRedirect(req: Request) {
  // 303 = "See Other" (after POST, navigate to GET "/")
  const res = NextResponse.redirect(new URL("/", req.url), { status: 303 });
  // Clear your auth cookies
  res.cookies.set("access", "", { path: "/", maxAge: 0 });
  res.cookies.set("refresh", "", { path: "/", maxAge: 0 });
  return res;
}

export async function POST(req: Request) {
  return clearAndRedirect(req);
}

export async function GET(req: Request) {
  return clearAndRedirect(req);
}
