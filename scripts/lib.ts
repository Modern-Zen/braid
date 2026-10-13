// Shared helpers for the operator scripts (smoke, seed, demo, reset).
// Configuration comes from the environment (PowerShell):
//   $env:BRAID_URL = "https://braid.<subdomain>.workers.dev"   # default http://localhost:8787
//   $env:BRAID_ADMIN_TOKEN = "<the ADMIN_TOKEN secret>"        # default: .dev.vars (local) or .braid/prod.secrets
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Local runs read .dev.vars; the deployed Worker's operator token lives in .braid/prod.secrets. */
function devVar(name: string): string | undefined {
  const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/.test(process.env.BRAID_URL ?? "http://localhost:8787");
  const file = local ? join(repoRoot, ".dev.vars") : join(repoRoot, ".braid", "prod.secrets");
  if (!existsSync(file)) return undefined;
  const line = readFileSync(file, "utf8")
    .split(/\r?\n/)
    .find((l) => l.startsWith(`${name}=`));
  return line?.slice(name.length + 1).trim().replace(/^"|"$/g, "");
}

export const BRAID_URL = (process.env.BRAID_URL ?? "http://localhost:8787").replace(/\/+$/, "");
export const ADMIN_TOKEN = process.env.BRAID_ADMIN_TOKEN ?? devVar("ADMIN_TOKEN") ?? "";

export async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  if (!ADMIN_TOKEN) throw new Error("Set $env:BRAID_ADMIN_TOKEN (or ADMIN_TOKEN in .dev.vars)");
  const res = await fetch(`${BRAID_URL}${path}`, {
    method,
    headers: { authorization: `Bearer ${ADMIN_TOKEN}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 500)}`);
  }
  if (!res.ok && !(json && typeof json === "object" && "steps" in json)) {
    throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 500)}`);
  }
  return json as T;
}

/**
 * Run git with an Artifacts token as a Bearer header (kept out of the remote URL and
 * out of .git/config). Output is returned; the token is never printed.
 */
export function git(cwd: string, args: string[], token?: string): string {
  const auth = token ? ["-c", `http.extraHeader=Authorization: Bearer ${token}`] : [];
  try {
    return execFileSync("git", [...auth, ...args], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    }).trim();
  } catch (err) {
    const e = err as { stderr?: string; message: string };
    const detail = (e.stderr ?? e.message).replaceAll(token ?? "\u0000", "<token>");
    throw new Error(`git ${args[0]} failed: ${detail}`);
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function ok(msg: string): void {
  console.log(`  ✓ ${msg}`);
}
export function fail(msg: string): void {
  console.log(`  ✗ ${msg}`);
}
