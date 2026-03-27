export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const redirectUri = process.env.REDIRECT_URI || null;
  const token = req.nextUrl.searchParams.get("token")?.trim() || "";

  if (!redirectUri || !token) {
    return NextResponse.json({ error: "missing_params", ok: false }, { status: 400 });
  }

  const url = new URL(redirectUri);
  url.searchParams.set("token", token);

  return NextResponse.redirect(url);
}
