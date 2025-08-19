export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { clearAuthCookies } from "@/lib/api";

export async function POST() {
  clearAuthCookies();
  return NextResponse.json({ ok: true });
}
