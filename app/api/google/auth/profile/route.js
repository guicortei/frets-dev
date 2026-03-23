import { NextResponse } from "next/server";

import {
  GOOGLE_REFRESH_COOKIE,
  decryptRefreshToken,
  getOAuthConfig,
} from "../../_lib/oauth";

async function getAccessTokenFromRefreshToken(refreshToken) {
  const { clientId, clientSecret, tokenUrl } = getOAuthConfig();
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  const tokenResponse = await fetch(tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  const tokenPayload = await tokenResponse.json();
  if (!tokenResponse.ok || !tokenPayload?.access_token) {
    throw new Error("Unable to refresh Google access token.");
  }
  return tokenPayload.access_token;
}

export async function GET(request) {
  try {
    const encrypted = request.cookies.get(GOOGLE_REFRESH_COOKIE)?.value || "";
    const refreshToken = decryptRefreshToken(encrypted);
    if (!refreshToken) {
      return NextResponse.json({ connected: false, profile: null }, { status: 401 });
    }

    const accessToken = await getAccessTokenFromRefreshToken(refreshToken);
    const response = await fetch("https://www.googleapis.com/drive/v3/about?fields=user(displayName,emailAddress,photoLink)", {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error?.message || "Failed to fetch Google profile.");
    }

    const user = payload?.user || {};
    return NextResponse.json({
      connected: true,
      profile: {
        name: user.displayName || null,
        email: user.emailAddress || null,
        imageUrl: user.photoLink || null,
      },
    });
  } catch {
    return NextResponse.json({ connected: false, profile: null }, { status: 500 });
  }
}
