import crypto from "node:crypto";
import { NextResponse } from "next/server";

import {
  GOOGLE_STATE_COOKIE,
  getCookieOptions,
  getOAuthConfig,
  signStatePayload,
} from "../../_lib/oauth";

export async function GET(request) {
  try {
    const { authUrl, clientId, redirectUri, scopes } = getOAuthConfig();
    const { searchParams } = new URL(request.url);
    const returnTo = searchParams.get("returnTo") || "/heat-map-memory";

    const statePayload = signStatePayload({
      nonce: crypto.randomUUID(),
      returnTo,
      createdAt: Date.now(),
    });

    const oauthUrl = new URL(authUrl);
    oauthUrl.searchParams.set("client_id", clientId);
    oauthUrl.searchParams.set("redirect_uri", redirectUri);
    oauthUrl.searchParams.set("response_type", "code");
    oauthUrl.searchParams.set("scope", scopes);
    oauthUrl.searchParams.set("access_type", "offline");
    oauthUrl.searchParams.set("prompt", "consent");
    oauthUrl.searchParams.set("include_granted_scopes", "true");
    oauthUrl.searchParams.set("state", statePayload);

    const response = NextResponse.redirect(oauthUrl.toString());
    response.cookies.set(GOOGLE_STATE_COOKIE, statePayload, getCookieOptions(60 * 10));
    return response;
  } catch (error) {
    const fallback = new URL("/heat-map-memory", request.url);
    fallback.searchParams.set("googleAuth", "config_error");
    if (error instanceof Error) {
      const detail = `${error.name}:${error.message}`.slice(0, 180);
      fallback.searchParams.set("googleAuthDetail", detail);
      // Server-side log helps debug local/prod env config mismatches quickly.
      console.error("[google-auth-start] config error", error);
    } else {
      fallback.searchParams.set("googleAuthDetail", "unknown_error");
      console.error("[google-auth-start] unknown config error");
    }
    return NextResponse.redirect(fallback.toString());
  }
}
