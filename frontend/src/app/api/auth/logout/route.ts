import { NextResponse } from "next/server";
import { clearAuthCookies } from "@/lib/jwt";

export async function POST() {
  clearAuthCookies();
  return NextResponse.json({ ok: true });
}
