import { NextResponse } from "next/server";

import { GOOGLE_REFRESH_COOKIE, getCookieOptions } from "../../_lib/oauth";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(GOOGLE_REFRESH_COOKIE, "", getCookieOptions(0));
  return response;
}
