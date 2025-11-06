import { NextRequest } from "next/server";
import { getPicoBase, setPicoBase } from "../../../pico/lib/picoTarget";

export async function GET() {
  return Response.json({ base: getPicoBase() || null });
}

export async function POST(req: NextRequest) {
  try {
    const { base } = await req.json();
    if (!base || typeof base !== "string") {
      return Response.json({ error: "Provide 'base' string" }, { status: 400 });
    }
    const normalized = setPicoBase(base);
    return Response.json({ ok: true, base: normalized });
  } catch (e: any) {
    return Response.json({ error: e?.message || "Invalid JSON" }, { status: 400 });
  }
}
