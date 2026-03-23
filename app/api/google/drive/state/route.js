import { NextResponse } from "next/server";

import {
  GOOGLE_REFRESH_COOKIE,
  decryptRefreshToken,
  getOAuthConfig,
} from "../../_lib/oauth";

const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_BASE = "https://www.googleapis.com/upload/drive/v3";
const DRIVE_STATE_FILE_NAME = "frets-dev-heat-map-memory-state.json";

async function getAccessTokenFromRefresh(refreshToken) {
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
  const payload = await tokenResponse.json();
  if (!tokenResponse.ok || !payload?.access_token) {
    throw new Error("Unable to refresh Google access token.");
  }
  return payload.access_token;
}

async function findStateFile(accessToken) {
  const listUrl = new URL(`${DRIVE_API_BASE}/files`);
  listUrl.searchParams.set("q", `name='${DRIVE_STATE_FILE_NAME}' and trashed=false`);
  listUrl.searchParams.set("spaces", "drive");
  listUrl.searchParams.set("fields", "files(id,name,modifiedTime)");
  listUrl.searchParams.set("pageSize", "5");

  const response = await fetch(listUrl.toString(), {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Failed to list Google Drive files.");
  const payload = await response.json();
  const files = Array.isArray(payload?.files) ? payload.files : [];
  return files[0] || null;
}

async function getStateFileContent(accessToken, fileId) {
  const fileResponse = await fetch(`${DRIVE_API_BASE}/files/${fileId}?alt=media`, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!fileResponse.ok) throw new Error("Failed to read state file from Google Drive.");
  const rawText = await fileResponse.text();
  try {
    return JSON.parse(rawText);
  } catch {
    return null;
  }
}

async function upsertStateFile(accessToken, existingFileId, statePayload) {
  const boundary = `frets-boundary-${Math.random().toString(36).slice(2)}`;
  const metadata = {
    name: DRIVE_STATE_FILE_NAME,
    mimeType: "application/json",
  };
  const multipartBody = [
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    JSON.stringify(metadata),
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    JSON.stringify(statePayload),
    `--${boundary}--`,
    "",
  ].join("\r\n");

  const method = existingFileId ? "PATCH" : "POST";
  const url = existingFileId
    ? `${DRIVE_UPLOAD_BASE}/files/${existingFileId}?uploadType=multipart`
    : `${DRIVE_UPLOAD_BASE}/files?uploadType=multipart`;

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body: multipartBody,
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Failed to write state file to Google Drive.");
  return response.json();
}

function getRefreshTokenFromRequest(request) {
  const encrypted = request.cookies.get(GOOGLE_REFRESH_COOKIE)?.value || "";
  return decryptRefreshToken(encrypted);
}

export async function GET(request) {
  try {
    const refreshToken = getRefreshTokenFromRequest(request);
    if (!refreshToken) {
      return NextResponse.json({ ok: false, reason: "not_connected" }, { status: 401 });
    }
    const accessToken = await getAccessTokenFromRefresh(refreshToken);
    const existingFile = await findStateFile(accessToken);
    if (!existingFile?.id) {
      return NextResponse.json({ ok: true, state: null });
    }
    const state = await getStateFileContent(accessToken, existingFile.id);
    return NextResponse.json({ ok: true, state, fileId: existingFile.id });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function PUT(request) {
  try {
    const refreshToken = getRefreshTokenFromRequest(request);
    if (!refreshToken) {
      return NextResponse.json({ ok: false, reason: "not_connected" }, { status: 401 });
    }
    const incoming = await request.json();
    const statePayload = incoming && typeof incoming === "object" ? incoming : {};

    const accessToken = await getAccessTokenFromRefresh(refreshToken);
    const existingFile = await findStateFile(accessToken);
    const saved = await upsertStateFile(accessToken, existingFile?.id || null, statePayload);

    return NextResponse.json({ ok: true, fileId: saved?.id || existingFile?.id || null });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
