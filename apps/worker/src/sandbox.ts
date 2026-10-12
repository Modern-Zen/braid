// Sandbox containers (Sandbox SDK 1.0): one AgentSandbox Durable Object per
// Channel / review / Confluence run, each with its own Linux container.
//
// The container has no direct Internet access. Every HTTP(S) request leaves
// through `Outbound`, which allows only:
//   - the Artifacts git remotes this sandbox was granted (it adds the repo token,
//     so tokens never enter the container and never show up in a log or a diff),
//   - the npm registry (installs for tests), when allowed,
//   - AI Gateway (live agents), when allowed; the Worker adds the gateway token.
import { Files, SandboxFileError } from "@cloudflare/sandbox";
import { DurableObject, WorkerEntrypoint } from "cloudflare:workers";
import { getAgentByName } from "agents";

const CA_PATH = "/etc/cloudflare/certs/cloudflare-containers-ca.crt";
/** Every HTTPS request is re-signed by the containers CA, so tools must trust it. */
const TRUST_ENV: Record<string, string> = {
  NODE_EXTRA_CA_CERTS: CA_PATH,
  GIT_SSL_CAINFO: CA_PATH,
  CURL_CA_BUNDLE: CA_PATH,
  SSL_CERT_FILE: CA_PATH,
};
const GIT_ENV: Record<string, string> = {
  GIT_AUTHOR_NAME: "Headwaters",
  GIT_AUTHOR_EMAIL: "agents@braid.drp.icu",
  GIT_COMMITTER_NAME: "Headwaters",
  GIT_COMMITTER_EMAIL: "agents@braid.drp.icu",
  GIT_TERMINAL_PROMPT: "0",
  HOME: "/root",
};
const INACTIVITY_TIMEOUT_MS = 20 * 60 * 1000;
const KEEPALIVE_MS = 60 * 1000;
const GRANT_KEY = "grant";
const BUSY_KEY = "busy-until";

export type InstanceType = "lite" | "standard-1" | "standard-2" | "standard-3" | "standard-4";

export interface RepoGrant {
  /** Full Artifacts token ("art_v1_…?expires=…"). Lives in DO storage and gateway props only. */
  token: string;
  write: boolean;
}

/** What a sandbox may reach. Passed to Outbound as props. */
export interface OutboundProps {
  artifactsHost: string;
  /** Keyed by remote path, e.g. "/git/braid/river-riverlevels--ch-2.git". */
  repos: Record<string, RepoGrant>;
  allowNpm: boolean;
  aiGateway?: { accountId: string; gatewayId: string };
  /** Identity for `braid-line` calls to $BRAID_API/internal/* (answered here, never forwarded). */
  channel?: { riverId: string; intentId: string; channelId: string; apiHost: string };
  /** Preview uploads: wrangler may call the Workers API for this account; the token is added here. */
  cfApi?: { accountId: string };
}

export interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export interface ExecOptions {
  cwd?: string;
  env?: Record<string, string>;
  /** Hard limit in seconds; the command is killed after it (exit code 124). */
  timeoutSec?: number;
}

const NPM_HOSTS = new Set(["registry.npmjs.org", "registry.yarnpkg.com"]);

export class Outbound extends WorkerEntrypoint<Env, OutboundProps> {
  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const grant = this.ctx.props;
    if (url.protocol !== "https:") return deny(`${url.hostname} is reachable only over HTTPS`);
    if (!grant) return deny("sandbox has no outbound grant");

    if (url.hostname === grant.artifactsHost) {
      const repoPath = Object.keys(grant.repos).find((p) => url.pathname === p || url.pathname.startsWith(`${p}/`));
      if (!repoPath) return deny(`repo ${url.pathname} is not granted to this sandbox`);
      const repo = grant.repos[repoPath]!;
      const pushing = url.pathname.endsWith("/git-receive-pack") || url.searchParams.get("service") === "git-receive-pack";
      if (pushing && !repo.write) return deny("read-only grant");
      const headers = new Headers(request.headers);
      headers.set("Authorization", `Bearer ${repo.token}`);
      return fetch(new Request(request, { headers }));
    }

    if (grant.channel && url.hostname === grant.channel.apiHost && url.pathname.startsWith("/internal/")) {
      return this.internal(url, request, grant.channel);
    }

    if (grant.allowNpm && NPM_HOSTS.has(url.hostname)) return fetch(request);

    if (grant.cfApi && url.hostname === "api.cloudflare.com") {
      const scoped = url.pathname.startsWith(`/client/v4/accounts/${grant.cfApi.accountId}/workers/`) || url.pathname === "/client/v4/user/tokens/verify" || url.pathname === "/client/v4/memberships";
      if (!scoped) return deny(`Workers API path ${url.pathname} is not allowed`);
      const token = (this.env as Env & { CLOUDFLARE_API_TOKEN?: string }).CLOUDFLARE_API_TOKEN;
      if (!token) return deny("CLOUDFLARE_API_TOKEN is not configured");
      const headers = new Headers(request.headers);
      headers.set("Authorization", `Bearer ${token}`);
      return fetch(new Request(request, { headers }));
    }

    if (grant.aiGateway && url.hostname === "gateway.ai.cloudflare.com") {
      const prefix = `/v1/${grant.aiGateway.accountId}/${grant.aiGateway.gatewayId}`;
      if (url.pathname !== prefix && !url.pathname.startsWith(`${prefix}/`)) return deny("wrong gateway");
      const token = (this.env as Env & { AI_GATEWAY_TOKEN?: string }).AI_GATEWAY_TOKEN;
      if (!token) return deny("AI Gateway token is not configured");
      const headers = new Headers(request.headers);
      headers.delete("x-api-key");
      headers.set("cf-aig-authorization", `Bearer ${token}`);
      return fetch(new Request(request, { headers }));
    }

    return deny(`${url.hostname} is not reachable from this sandbox`);
  }

  /** braid-line from inside the container, answered for the Channel this sandbox belongs to. */
  private async internal(url: URL, request: Request, ch: NonNullable<OutboundProps["channel"]>): Promise<Response> {
    if (request.method !== "POST") return deny("POST only");
    const body = (await request.json().catch(() => ({}))) as { globs?: unknown; note?: unknown };
    const globs = Array.isArray(body.globs) ? body.globs.filter((g): g is string => typeof g === "string").slice(0, 50) : [];
    const note = typeof body.note === "string" ? body.note.slice(0, 200) : undefined;
    const river = await getAgentByName(this.env.RiverAgent, ch.riverId);
    if (url.pathname === "/internal/line/declare") {
      if (globs.length === 0) return Response.json({ error: "globs required" }, { status: 400 });
      return Response.json(await river.declareLines({ channelId: ch.channelId, intentId: ch.intentId, globs, note }));
    }
    if (url.pathname === "/internal/line/release") {
      return Response.json({ ok: true, released: await river.releaseLines(ch.channelId, globs) });
    }
    return deny("unknown internal route");
  }
}

function deny(message: string): Response {
  return new Response(`${message}\n`, { status: 403 });
}

export class AgentSandbox extends DurableObject<Env> {
  private readonly container: Container;
  private readonly files: Files;
  private setup: Promise<void> | undefined;
  private instance: InstanceType = "standard-1";

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    const container = ctx.container;
    if (!container) throw new Error("The container binding is not configured");
    this.container = container;
    this.files = new Files(container);
    if (container.running) {
      // Re-register interception after a deploy or an eviction restarted this object.
      void ctx.blockConcurrencyWhile(() => this.applyGrant());
    }
  }

  /** Set what this sandbox may reach. Safe to call again (e.g. to refresh tokens). */
  async grant(props: OutboundProps, instance?: InstanceType): Promise<void> {
    this.ctx.storage.kv.put(GRANT_KEY, props);
    if (instance) this.instance = instance;
    if (this.container.running) await this.applyGrant();
  }

  async exec(argv: string[], opts: ExecOptions = {}): Promise<CommandResult> {
    await this.ensureStarted();
    const started = Date.now();
    const timeout = opts.timeoutSec ?? 600;
    const cmd = ["timeout", "--kill-after=5", String(timeout), ...argv];
    const proc = await this.container.exec(cmd, {
      cwd: opts.cwd ?? "/workspace",
      env: { ...TRUST_ENV, ...GIT_ENV, PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin", ...opts.env },
    });
    const out = await proc.output();
    const dec = new TextDecoder();
    return {
      exitCode: out.exitCode,
      stdout: clip(dec.decode(out.stdout)),
      stderr: clip(dec.decode(out.stderr)),
      durationMs: Date.now() - started,
    };
  }

  /** Run a bash script (no login shell, so container ENV stays out of the way). */
  sh(script: string, opts: ExecOptions = {}): Promise<CommandResult> {
    return this.exec(["bash", "-euo", "pipefail", "-c", script], opts);
  }

  async writeFile(path: string, content: string): Promise<void> {
    await this.ensureStarted();
    const dir = path.slice(0, path.lastIndexOf("/"));
    if (dir) await this.files.mkdir(dir, { recursive: true });
    await this.files.writeFile(path, content);
  }

  async readFile(path: string): Promise<string | null> {
    await this.ensureStarted();
    try {
      return await (await this.files.readFile(path)).text();
    } catch (err) {
      if (SandboxFileError.is(err) && err.code === "ENOENT") return null;
      throw err;
    }
  }

  /** Keep the container alive for long work that doesn't come through exec(). */
  async keepAliveFor(ms: number): Promise<void> {
    this.ctx.storage.kv.put(BUSY_KEY, Date.now() + ms);
    await this.ctx.storage.setAlarm(Date.now() + KEEPALIVE_MS);
  }

  async destroy(): Promise<void> {
    this.ctx.storage.kv.delete(BUSY_KEY);
    if (this.container.running) await this.container.destroy();
    this.setup = undefined;
  }

  override async alarm(): Promise<void> {
    const until = this.ctx.storage.kv.get<number>(BUSY_KEY);
    if (!this.container.running || until === undefined) return;
    if (Date.now() < until) await this.ctx.storage.setAlarm(Date.now() + KEEPALIVE_MS);
    else this.ctx.storage.kv.delete(BUSY_KEY);
  }

  private async ensureStarted(): Promise<void> {
    if (this.setup === undefined || !this.container.running) {
      this.setup = this.start().catch((err) => {
        this.setup = undefined;
        throw err;
      });
    }
    await this.setup;
  }

  private async start(): Promise<void> {
    if (!this.container.running) {
      const image = this.container.images.agent;
      if (!image) throw new Error("container image 'agent' is not configured");
      this.container.start({ image, instance: this.instance, enableInternet: false });
    }
    try {
      await this.applyGrant();
      await this.container.setInactivityTimeout(INACTIVITY_TIMEOUT_MS);
    } catch (err) {
      await this.container.destroy();
      throw err;
    }
  }

  private async applyGrant(): Promise<void> {
    const props = this.ctx.storage.kv.get<OutboundProps>(GRANT_KEY) ?? {
      artifactsHost: "",
      repos: {},
      allowNpm: false,
    };
    const gateway = this.ctx.exports.Outbound({ props });
    await this.container.interceptAllOutboundHttp(gateway);
    await this.container.interceptOutboundHttps("*", gateway);
  }
}

/** Keep DO memory bounded; callers stream large output to files instead. */
function clip(s: string, max = 200_000): string {
  return s.length > max ? `${s.slice(0, max / 2)}\n…[${s.length - max} bytes clipped]…\n${s.slice(-max / 2)}` : s;
}

/** Shell-quote a single argument for bash -c scripts. */
export function q(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/** Get a sandbox stub by name (one container per name). */
export function sandboxFor(env: Env, name: string): DurableObjectStub<AgentSandbox> {
  return env.SANDBOX.getByName(name) as DurableObjectStub<AgentSandbox>;
}
