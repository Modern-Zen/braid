// Public, read-only Git over HTTPS for allowlisted repos:
//
//   git clone https://<headwaters>/git/river-braid.git
//
// Artifacts repos always need a token, so the Worker forwards smart-HTTP upload-pack (clone and
// fetch) to the repo's Artifacts remote with a short-lived read token it holds. Pushes are
// refused: Headwaters hosts its own source here, and agents push to their own Channel forks.
import { mintToken, repoInfo } from "./artifacts.ts";

const tokens = new Map<string, { secret: string; expires: number }>();

async function readToken(env: Env, repo: string): Promise<string> {
  const hit = tokens.get(repo);
  if (hit && hit.expires > Date.now() + 60_000) return hit.secret;
  const t = await mintToken(env.ARTIFACTS, repo, "read", 3600);
  tokens.set(repo, { secret: t.plaintext, expires: Date.parse(t.expiresAt) || Date.now() + 3_000_000 });
  return t.plaintext;
}

export function publicRepos(env: Env): Set<string> {
  const list = (env as Env & { PUBLIC_REPOS?: string }).PUBLIC_REPOS ?? "";
  return new Set(list.split(",").map((s) => s.trim()).filter(Boolean));
}

const FORWARD = ["content-type", "content-encoding", "accept", "accept-encoding", "git-protocol", "user-agent"];

export async function handleGit(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const m = /^\/git\/([A-Za-z0-9][A-Za-z0-9._-]*?)(?:\.git)?(\/.*)$/.exec(url.pathname);
  if (!m) return text(404, "Not a Git path. Try /git/river-braid.git");
  const [, repo, rest] = m as unknown as [string, string, string];
  if (!publicRepos(env).has(repo)) return text(404, `Repository ${repo} is not public.`);

  const service = url.searchParams.get("service");
  const pushing = rest.endsWith("/git-receive-pack") || service === "git-receive-pack";
  if (pushing) return text(403, "Read-only. Headwaters agents push to their own Channel forks.");
  const allowed =
    (request.method === "GET" && rest === "/info/refs" && service === "git-upload-pack") ||
    (request.method === "POST" && rest === "/git-upload-pack") ||
    (request.method === "GET" && rest === "/HEAD");
  if (!allowed) return text(404, "Only smart-HTTP clone and fetch are served.");

  const info = await repoInfo(env.ARTIFACTS, repo);
  if (!info) return text(404, `No repository ${repo}.`);
  const target = new URL(`${info.remote.replace(/\/+$/, "")}${rest}`);
  target.search = url.search;

  const headers = new Headers();
  for (const h of FORWARD) {
    const v = request.headers.get(h);
    if (v) headers.set(h, v);
  }
  headers.set("authorization", `Bearer ${await readToken(env, repo)}`);
  const upstream = await fetch(target, {
    method: request.method,
    headers,
    body: request.method === "POST" ? request.body : undefined,
  });
  const out = new Headers();
  for (const h of ["content-type", "content-encoding", "cache-control", "expires", "pragma"]) {
    const v = upstream.headers.get(h);
    if (v) out.set(h, v);
  }
  return new Response(upstream.body, { status: upstream.status, headers: out });
}

function text(status: number, body: string): Response {
  return new Response(`${body}\n`, { status, headers: { "content-type": "text/plain; charset=utf-8" } });
}
