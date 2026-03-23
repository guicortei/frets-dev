import { NextResponse } from "next/server";

import {
  GOOGLE_REFRESH_COOKIE,
  GOOGLE_STATE_COOKIE,
  decryptRefreshToken,
  encryptRefreshToken,
  getCookieOptions,
  getOAuthConfig,
  verifyStatePayload,
} from "../../_lib/oauth";

export async function GET(request) {
  const callbackUrl = new URL(request.url);
  const code = callbackUrl.searchParams.get("code");
  const state = callbackUrl.searchParams.get("state");
  const error = callbackUrl.searchParams.get("error");
  const storedState = request.cookies.get(GOOGLE_STATE_COOKIE)?.value || "";

  const parsedState = verifyStatePayload(state || "");
  const storedParsedState = verifyStatePayload(storedState);
  const returnTo = parsedState?.returnTo || storedParsedState?.returnTo || "/name-the-note";

  const redirectTo = new URL(returnTo, request.url);
  const clearStateCookie = (response) => {
    response.cookies.set(GOOGLE_STATE_COOKIE, "", getCookieOptions(0));
  };

  if (error) {
    redirectTo.searchParams.set("googleAuth", "denied");
    const deniedResponse = NextResponse.redirect(redirectTo.toString());
    clearStateCookie(deniedResponse);
    return deniedResponse;
  }

  if (!state || !storedState || state !== storedState || !parsedState || !storedParsedState) {
    redirectTo.searchParams.set("googleAuth", "state_error");
    const stateErrorResponse = NextResponse.redirect(redirectTo.toString());
    clearStateCookie(stateErrorResponse);
    return stateErrorResponse;
  }

  if (!code) {
    redirectTo.searchParams.set("googleAuth", "missing_code");
    const noCodeResponse = NextResponse.redirect(redirectTo.toString());
    clearStateCookie(noCodeResponse);
    return noCodeResponse;
  }

  try {
    const { clientId, clientSecret, redirectUri, tokenUrl } = getOAuthConfig();
    const body = new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    });

    const tokenResponse = await fetch(tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
    });
    const tokenPayload = await tokenResponse.json();

    if (!tokenResponse.ok) {
      throw new Error(`OAuth token exchange failed: ${tokenPayload?.error || tokenResponse.status}`);
    }

    let refreshToken = tokenPayload?.refresh_token || null;
    if (!refreshToken) {
      const existingEncrypted = request.cookies.get(GOOGLE_REFRESH_COOKIE)?.value || "";
      refreshToken = decryptRefreshToken(existingEncrypted);
    }
    if (!refreshToken) {
      throw new Error("Missing refresh token from Google OAuth flow.");
    }

    redirectTo.searchParams.set("googleAuth", "connected");
    const response = NextResponse.redirect(redirectTo.toString());
    response.cookies.set(
      GOOGLE_REFRESH_COOKIE,
      encryptRefreshToken(refreshToken),
      getCookieOptions(60 * 60 * 24 * 180),
    );
    clearStateCookie(response);
    return response;
  } catch (err) {
    redirectTo.searchParams.set("googleAuth", "token_error");
    const errorResponse = NextResponse.redirect(redirectTo.toString());
    clearStateCookie(errorResponse);
    return errorResponse;
  }
}
