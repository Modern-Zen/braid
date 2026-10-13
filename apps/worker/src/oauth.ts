// OAuth 2.1 for MCP clients (ChatGPT, claude.ai, Cursor, VS Code, Codex, Gemini CLI, Goose…).
// Clients register themselves (dynamic client registration), send the person to /authorize,
// and get a River-scoped token. Header-capable harnesses can keep using a River agent token
// (`hw_…`), accepted through resolveExternalToken.
//
// The provider is built per origin: the token audience must be the canonical MCP URL, and the
// Worker answers on workers.dev and on its custom domain.
import { OAuthProvider, type AuthRequest, type OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { getAgentByName } from "agents";
import type { Context } from "hono";
import { resolveHuman, type HwEnv } from "./auth.ts";
import { listRivers } from "./db.ts";
import { esc, page } from "./html.ts";
import { handleMcp, riverForAgentToken, type McpProps } from "./mcp.ts";

const providers = new Map<string, OAuthProvider<Env>>();

type WithFetch = { fetch: ExportedHandlerFetchHandler<Env> };

export function providerFor(origin: string, app: WithFetch): OAuthProvider<Env> {
  let p = providers.get(origin);
  if (p) return p;
  const resource = `${origin}/mcp`;
  p = new OAuthProvider<Env>({
    apiRoute: "/mcp",
    apiHandler: {
      fetch: (request, env, ctx) => handleMcp(request as Request, env, ctx, (ctx as unknown as { props: McpProps }).props),
    } satisfies WithFetch,
    defaultHandler: app,
    authorizeEndpoint: "/authorize",
    tokenEndpoint: "/oauth/token",
    clientRegistrationEndpoint: "/oauth/register",
    scopesSupported: ["river"],
    resourceMetadata: { resource },
    resolveExternalToken: async ({ token, env }) => {
      const riverId = await riverForAgentToken(env, token);
      return riverId ? { props: { riverId, client: "agent-token" } satisfies McpProps, audience: resource } : null;
    },
  });
  providers.set(origin, p);
  return p;
}

type OAuthEnv = Env & { OAUTH_PROVIDER: OAuthHelpers };

/** GET and POST /authorize: sign in, pick the River, allow. */
export async function authorize(c: Context<HwEnv>): Promise<Response> {
  const helpers = (c.env as OAuthEnv).OAUTH_PROVIDER;
  // Re-parse from the URL on POST too: the form posts back to the same URL with its query.
  let req: AuthRequest;
  try {
    req = await helpers.parseAuthRequest(new Request(c.req.url));
  } catch (err) {
    return page(400, "This sign-in link is not valid", `<p>${esc(err instanceof Error ? err.message : String(err))}</p>`);
  }
  const client = await helpers.lookupClient(req.clientId);
  const clientName = client?.clientName ?? req.clientId;

  const principal = await resolveHuman(c);
  if (!principal) return signInPage(clientName);

  if (c.req.method === "POST") {
    const origin = c.req.header("origin");
    if (origin && origin !== new URL(c.req.url).origin) return page(403, "Cross-site request refused", "");
    const form = await c.req.formData();
    if (form.get("decision") !== "allow") {
      const deny = new URL(req.redirectUri);
      deny.searchParams.set("error", "access_denied");
      if (req.state) deny.searchParams.set("state", req.state);
      if (req.issuer) deny.searchParams.set("iss", req.issuer);
      return c.redirect(deny.toString(), 302);
    }
    const riverId = String(form.get("river") ?? "");
    const rivers = await listRivers(c.env.DB);
    if (!rivers.some((r) => r.id === riverId)) return page(400, "Pick a River", "");
    const who = principal.kind === "human" ? principal.email : "operator";
    const { redirectTo } = await helpers.completeAuthorization({
      request: req,
      userId: encodeURIComponent(who),
      metadata: { client: clientName, river: riverId },
      scope: req.scope.length > 0 ? req.scope : ["river"],
      props: { riverId, client: clientName } satisfies McpProps,
    });
    await (await getAgentByName(c.env.RiverAgent, riverId)).recordEvent({
      id: `token.issued:${riverId}:oauth:${req.clientId}:${Date.now()}`,
      type: "token.issued",
      at: Date.now(),
      riverId,
      detail: `${clientName} · scope: river · oauth`,
    });
    return c.redirect(redirectTo, 302);
  }

  const rivers = await listRivers(c.env.DB);
  const options = rivers.map((r, i) => `<option value="${esc(r.id)}"${i === 0 ? " selected" : ""}>${esc(r.name)} · ${esc(r.mainRepo)}</option>`).join("");
  return page(
    200,
    `Let ${clientName} join a River`,
    `<p><strong>${esc(clientName)}</strong> wants to work in Headwaters as an agent. It will be able to read the River,
      open and take Intents, fork its own Channels, declare Lines, and push to its own forks. It can never push to main.</p>
     <form method="post">
       <label for="river">River</label>
       <select id="river" name="river">${options}</select>
       <div class="actions">
         <button class="primary" name="decision" value="allow">Allow</button>
         <button class="secondary" name="decision" value="deny">Deny</button>
       </div>
     </form>
     <p class="meta">Redirects to ${esc(new URL(req.redirectUri).origin)} · scope: ${esc((req.scope.length ? req.scope : ["river"]).join(" "))}</p>`,
  );
}

function signInPage(clientName: string): Response {
  return page(
    401,
    "Sign in to Headwaters",
    `<p>${esc(clientName)} wants to join a River. Sign in to choose which one.</p>
     <form id="f">
       <label for="t">Operator token</label>
       <input id="t" type="password" autocomplete="current-password" required>
       <div class="actions"><button class="primary">Continue</button></div>
       <p class="meta" id="e"></p>
     </form>
     <script>
       document.getElementById("f").addEventListener("submit", async (ev) => {
         ev.preventDefault();
         const r = await fetch("/api/session", { method: "POST", headers: { "content-type": "application/json" },
           body: JSON.stringify({ token: document.getElementById("t").value }) });
         if (r.ok) location.reload(); else document.getElementById("e").textContent = "That token didn't work.";
       });
     </script>`,
  );
}
