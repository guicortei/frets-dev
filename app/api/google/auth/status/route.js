import { NextResponse } from "next/server";

import { GOOGLE_REFRESH_COOKIE } from "../../_lib/oauth";

export async function GET(request) {
  const isConnected = Boolean(request.cookies.get(GOOGLE_REFRESH_COOKIE)?.value);
  return NextResponse.json({ connected: isConnected });
}
