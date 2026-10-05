export const AIEDUKA_ACCESS_COOKIE = "aieduka_access";

interface AccessPayload {
  sub?: string;
  email?: string;
  platform?: string;
  iat?: number;
  exp?: number;
}

function fromBase64url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export async function verifyAiedukaAccessToken(token: string | undefined, platformSlug: string) {
  const secret = process.env.AIEDUKA_ACCESS_TOKEN_SECRET?.trim();
  if (!secret || secret.length < 32 || !token) return false;

  const parts = token.split(".");
  if (parts.length !== 3) return false;

  try {
    const data = `${parts[0]}.${parts[1]}`;
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const validSignature = await crypto.subtle.verify(
      "HMAC",
      key,
      fromBase64url(parts[2]),
      new TextEncoder().encode(data),
    );
    if (!validSignature) return false;

    const payload = JSON.parse(new TextDecoder().decode(fromBase64url(parts[1]))) as AccessPayload;
    const now = Math.floor(Date.now() / 1000);
    return payload.platform === platformSlug && typeof payload.exp === "number" && payload.exp > now;
  } catch {
    return false;
  }
}
