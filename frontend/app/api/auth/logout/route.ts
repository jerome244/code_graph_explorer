import { NextResponse } from "next/server";
export async function POST() {
  const res = new NextResponse(null, { status: 204 });
  res.cookies.set("access", "", { path: "/", maxAge: 0 });
  res.cookies.set("refresh", "", { path: "/", maxAge: 0 });
  return res;
}
