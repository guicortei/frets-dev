import crypto from "node:crypto";

export const GOOGLE_STATE_COOKIE = "google_oauth_state";
export const GOOGLE_REFRESH_COOKIE = "google_drive_refresh_token";

function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function getCookieSecret() {
  return (
    process.env.GOOGLE_OAUTH_COOKIE_SECRET
    || process.env.GOOGLE_CLIENT_SECRET
    || ""
  );
}

function cookieKey() {
  const secret = getCookieSecret();
  if (!secret) {
    throw new Error("Missing GOOGLE_OAUTH_COOKIE_SECRET (or GOOGLE_CLIENT_SECRET fallback).");
  }
  return crypto.createHash("sha256").update(secret).digest();
}

function base64Url(input) {
  return Buffer.from(input).toString("base64url");
}

function fromBase64Url(input) {
  return Buffer.from(input, "base64url");
}

export function getOAuthConfig() {
  return {
    clientId: getRequiredEnv("GOOGLE_CLIENT_ID"),
    clientSecret: getRequiredEnv("GOOGLE_CLIENT_SECRET"),
    redirectUri: getRequiredEnv("GOOGLE_OAUTH_REDIRECT_URI"),
    scopes: process.env.GOOGLE_OAUTH_SCOPES || "https://www.googleapis.com/auth/drive.file",
    authUrl: process.env.GOOGLE_OAUTH_AUTH_URL || "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: process.env.GOOGLE_OAUTH_TOKEN_URL || "https://oauth2.googleapis.com/token",
  };
}

export function getCookieOptions(maxAgeSeconds) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

export function signStatePayload(payload) {
  const rawPayload = JSON.stringify(payload);
  const encoded = base64Url(rawPayload);
  const signature = crypto
    .createHmac("sha256", cookieKey())
    .update(encoded)
    .digest("base64url");
  return `${encoded}.${signature}`;
}

export function verifyStatePayload(signedValue) {
  if (!signedValue || typeof signedValue !== "string" || !signedValue.includes(".")) {
    return null;
  }
  const [encoded, signature] = signedValue.split(".");
  const expected = crypto
    .createHmac("sha256", cookieKey())
    .update(encoded)
    .digest("base64url");
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (signatureBuffer.length !== expectedBuffer.length) {
    return null;
  }
  if (!crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return null;
  }
  try {
    return JSON.parse(fromBase64Url(encoded).toString("utf8"));
  } catch {
    return null;
  }
}

export function encryptRefreshToken(refreshToken) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", cookieKey(), iv);
  const encrypted = Buffer.concat([cipher.update(refreshToken, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptRefreshToken(encryptedValue) {
  if (!encryptedValue || typeof encryptedValue !== "string") return null;
  const parts = encryptedValue.split(".");
  if (parts.length !== 3) return null;
  try {
    const iv = Buffer.from(parts[0], "base64url");
    const tag = Buffer.from(parts[1], "base64url");
    const payload = Buffer.from(parts[2], "base64url");
    const decipher = crypto.createDecipheriv("aes-256-gcm", cookieKey(), iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(payload), decipher.final()]);
    return decrypted.toString("utf8");
  } catch {
    return null;
  }
}
