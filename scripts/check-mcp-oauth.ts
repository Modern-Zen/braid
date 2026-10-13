// pnpm check:mcp — exercises MCP auth end to end the way a harness does:
// discovery → 401 challenge → dynamic client registration → PKCE authorize (operator session)
// → token exchange → MCP initialize + river_join with the OAuth token, then with an agent token.
//
// PowerShell:
//   $env:BRAID_URL = "https://braid.modern-zen.workers.dev"; pnpm check:mcp
import { createHash, randomBytes } from "node:crypto";
import { ADMIN_TOKEN, api, BRAID_URL, fail, ok } from "./lib.ts";

const b64url = (b: Buffer) => b.toString("base64url");
const MCP = `${BRAID_URL}/mcp`;
let failures = 0;
const check = (cond: boolean, msg: string) => (cond ? ok(msg) : (failures++, fail(msg)));

async function mcp(token: string, id: number, method: string, params: unknown): Promise<any> {
  const res = await fetch(MCP, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": "2025-06-18",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
  const text = await res.text();
  const data = text.split("\n").find((l) => l.startsWith("data:"))?.slice(5) ?? text;
  return { status: res.status, body: JSON.parse(data) };
}

console.log(`MCP auth check → ${MCP}`);

// 1. Discovery and the challenge.
const challenge = await fetch(MCP, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
const www = challenge.headers.get("www-authenticate") ?? "";
check(challenge.status === 401 && www.includes("resource_metadata"), `401 with WWW-Authenticate resource_metadata`);
const prm = await (await fetch(`${BRAID_URL}/.well-known/oauth-protected-resource/mcp`)).json();
check(prm.resource === MCP, `protected resource metadata: resource ${prm.resource}`);
const as = await (await fetch(`${BRAID_URL}/.well-known/oauth-authorization-server`)).json();
check(!!as.registration_endpoint && as.code_challenge_methods_supported?.includes("S256"), `authorization server metadata (DCR, S256)`);

// 2. Dynamic client registration.
const redirect = "http://127.0.0.1:53682/callback";
const reg = await (
  await fetch(as.registration_endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_name: "headwaters-check", redirect_uris: [redirect], token_endpoint_auth_method: "none" }),
  })
).json();
check(!!reg.client_id, `registered client ${reg.client_id}`);

// 3. Authorize with PKCE, signed in as the operator.
const verifier = b64url(randomBytes(32));
const challengeS256 = b64url(createHash("sha256").update(verifier).digest());
const authUrl = new URL(as.authorization_endpoint);
for (const [k, v] of Object.entries({
  response_type: "code",
  client_id: reg.client_id,
  redirect_uri: redirect,
  scope: "river",
  state: "xyz",
  code_challenge: challengeS256,
  code_challenge_method: "S256",
  resource: MCP,
})) authUrl.searchParams.set(k, v);

const anon = await fetch(authUrl);
check(anon.status === 401 && (await anon.text()).includes("Sign in"), `authorize without a session shows sign-in`);
const session = await fetch(`${BRAID_URL}/api/session`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ token: ADMIN_TOKEN }),
});
const cookie = (session.headers.get("set-cookie") ?? "").split(";")[0]!;
const consent = await fetch(authUrl, { headers: { cookie } });
check(consent.status === 200 && (await consent.text()).includes("join a River"), `consent page`);
const allow = await fetch(authUrl, {
  method: "POST",
  redirect: "manual",
  headers: { cookie, origin: BRAID_URL, "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ river: "riverlevels", decision: "allow" }),
});
const loc = new URL(allow.headers.get("location") ?? "http://x/");
const code = loc.searchParams.get("code");
check(allow.status === 302 && !!code && loc.searchParams.get("state") === "xyz", `consent → redirect with code`);

// 4. Token exchange.
const tok = await (
  await fetch(as.token_endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code: code ?? "", redirect_uri: redirect, client_id: reg.client_id, code_verifier: verifier, resource: MCP }),
  })
).json();
check(!!tok.access_token, `access token issued (expires in ${tok.expires_in}s)`);

// 5. MCP with the OAuth token, then with a River agent token.
const init = await mcp(tok.access_token, 1, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "check", version: "1" } });
check(init.status === 200 && init.body.result?.serverInfo?.name === "headwaters", `initialize (OAuth token)`);
const tools = await mcp(tok.access_token, 2, "tools/list", {});
const names: string[] = tools.body.result?.tools?.map((t: { name: string }) => t.name) ?? [];
check(names.length === 9 && names.every((n) => /^[a-z_]+$/.test(n)), `tools/list: ${names.join(", ")}`);
const schemaText = JSON.stringify(tools.body.result?.tools ?? []);
check(!/"pattern"|"default"/.test(schemaText), `schemas have no pattern/default`);
const join = await mcp(tok.access_token, 3, "tools/call", { name: "river_join", arguments: { agent: "headwaters-check", model: "none" } });
check(!join.body.result?.isError && join.body.result?.content?.[0]?.text?.includes("river-riverlevels"), `river_join without a river argument (scoped by the grant)`);

const { token: agentToken } = await api<{ token: string }>("POST", "/api/admin/rivers/riverlevels/agent-token", { label: "check-mcp" });
const viaHeader = await mcp(agentToken, 4, "tools/call", { name: "intent_list", arguments: {} });
check(viaHeader.status === 200 && !viaHeader.body.result?.isError, `intent_list with a River agent token (header)`);

console.log(failures === 0 ? "MCP AUTH OK" : `MCP AUTH: ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
