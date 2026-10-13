// Route authorization.
//   - Humans (/app, /api): Cloudflare Access. The Worker verifies the Access JWT
//     (Cf-Access-Jwt-Assertion) when ACCESS_TEAM_DOMAIN and ACCESS_AUD are set.
//   - Operators and scripts: `Authorization: Bearer <ADMIN_TOKEN>`.
//   - Agents (MCP): per-River bearer tokens (M8).
// `/` (landing) and /health are public. Write tokens are never returned to a browser.
import type { Context, MiddlewareHandler } from "hono";

type AuthEnv = Env & { ACCESS_TEAM_DOMAIN?: string; ACCESS_AUD?: string };

export type Principal = { kind: "admin" } | { kind: "human"; email: string };
export type HwEnv = { Bindings: Env; Variables: { principal: Principal } };

export function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

function bearer(c: Context): string | null {
  const h = c.req.header("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1]!.trim() : null;
}

export function isAdmin(c: Context<HwEnv>): boolean {
  const token = bearer(c);
  return !!token && !!c.env.ADMIN_TOKEN && timingSafeEqual(token, c.env.ADMIN_TOKEN);
}

export const requireAdmin: MiddlewareHandler<HwEnv> = async (c, next) => {
  if (!isAdmin(c)) return c.json({ error: "unauthorized" }, 401);
  c.set("principal", { kind: "admin" });
  await next();
};

/** Who is this person? Access JWT, operator session cookie, admin bearer, or local dev. Null if nobody. */
export async function resolveHuman(c: Context<HwEnv>): Promise<Principal | null> {
  if (isAdmin(c)) return { kind: "admin" };
  const env = c.env as AuthEnv;
  // Local `wrangler dev` has no Access in front of it.
  if (!env.ACCESS_TEAM_DOMAIN && ["localhost", "127.0.0.1"].includes(new URL(c.req.url).hostname)) {
    return { kind: "human", email: "local@localhost" };
  }
  const jwt = c.req.header("cf-access-jwt-assertion");
  if (env.ACCESS_TEAM_DOMAIN && env.ACCESS_AUD && jwt) {
    const claims = await verifyAccessJwt(jwt, env.ACCESS_TEAM_DOMAIN, env.ACCESS_AUD);
    if (claims?.email) return { kind: "human", email: claims.email };
  }
  // Operator session (before Access is set up): cookie set by POST /api/session.
  const cookie = /(?:^|;\s*)hw_session=([0-9a-f]{64})/.exec(c.req.header("cookie") ?? "")?.[1];
  if (cookie && c.env.ADMIN_TOKEN && timingSafeEqual(cookie, await sessionValue(c.env.ADMIN_TOKEN))) {
    return { kind: "human", email: "operator" };
  }
  return null;
}

/** Humans via Cloudflare Access, the operator session, or the admin bearer. */
export const requireHuman: MiddlewareHandler<HwEnv> = async (c, next) => {
  const principal = await resolveHuman(c);
  if (!principal) return c.json({ error: "unauthorized" }, 401);
  c.set("principal", principal);
  await next();
};

/** The operator session cookie value: HMAC of a fixed label under ADMIN_TOKEN (rotates with it). */
export async function sessionValue(adminToken: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(adminToken), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode("hw-session-v1"));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** POST /api/session {token}: exchange the operator token for an HttpOnly session cookie. */
export async function startSession(c: Context<HwEnv>): Promise<Response> {
  const body = await c.req.json<{ token?: string }>().catch(() => ({ token: undefined }));
  if (!body.token || !c.env.ADMIN_TOKEN || !timingSafeEqual(body.token, c.env.ADMIN_TOKEN)) return c.json({ error: "unauthorized" }, 401);
  const secure = new URL(c.req.url).protocol === "https:" ? "; Secure" : "";
  c.header("set-cookie", `hw_session=${await sessionValue(c.env.ADMIN_TOKEN)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800${secure}`);
  return c.json({ ok: true });
}

export function endSession(c: Context<HwEnv>): Response {
  c.header("set-cookie", "hw_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0");
  return c.json({ ok: true });
}

/** GET /api/session: who am I (the UI uses it to decide whether to ask for a token). */
export const whoami: MiddlewareHandler<HwEnv> = async (c) => c.json({ principal: c.get("principal") });

interface AccessClaims {
  aud: string | string[];
  email?: string;
  exp: number;
  iss: string;
}

let certCache: { team: string; at: number; keys: Array<JsonWebKey & { kid: string }> } | null = null;

async function accessKeys(team: string): Promise<Array<JsonWebKey & { kid: string }>> {
  if (certCache && certCache.team === team && Date.now() - certCache.at < 10 * 60 * 1000) return certCache.keys;
  const res = await fetch(`https://${team}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error(`Access certs: ${res.status}`);
  const body = (await res.json()) as { keys: Array<JsonWebKey & { kid: string }> };
  certCache = { team, at: Date.now(), keys: body.keys };
  return body.keys;
}

function b64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=");
  return Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
}

export async function verifyAccessJwt(jwt: string, team: string, aud: string): Promise<AccessClaims | null> {
  const [h, p, s] = jwt.split(".");
  if (!h || !p || !s) return null;
  const header = JSON.parse(new TextDecoder().decode(b64urlToBytes(h))) as { kid?: string; alg?: string };
  if (header.alg !== "RS256") return null;
  const jwk = (await accessKeys(team)).find((k) => k.kid === header.kid);
  if (!jwk) return null;
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlToBytes(s), new TextEncoder().encode(`${h}.${p}`));
  if (!ok) return null;
  const claims = JSON.parse(new TextDecoder().decode(b64urlToBytes(p))) as AccessClaims;
  const auds = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!auds.includes(aud) || claims.exp * 1000 < Date.now() || claims.iss !== `https://${team}`) return null;
  return claims;
}
