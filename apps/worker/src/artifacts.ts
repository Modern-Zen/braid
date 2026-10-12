// Typed helpers over the Artifacts binding. Only methods that exist on the
// binding are used here: create/get/list/import/delete, and on a repo handle
// info/createToken/revokeToken/fork/log/readCommit/readTree/readBlob/readFile.
// There is no diff, merge, branch or write API: working-tree operations run in
// the sandbox with plain git.

export const TOKEN_TTL_SECONDS = 3600; // never longer than an hour

export function isArtifactsError(err: unknown, code?: ArtifactsErrorCode): err is ArtifactsError {
  const found = artifactsErrorCode(err);
  return found !== undefined && (code === undefined || found === code);
}

// Deployed, errors are ArtifactsError with a `code`. Through the local remote-binding
// proxy they arrive as Error("ArtifactsError: repo already exists: x"), so read the text too.
const MESSAGE_CODES: Array<[RegExp, ArtifactsErrorCode]> = [
  [/already exists/i, "ALREADY_EXISTS"],
  [/fork(ing)? (is )?(still )?in progress|still being forked/i, "FORK_IN_PROGRESS"],
  [/import(ing)? (is )?(still )?in progress|still being imported/i, "IMPORT_IN_PROGRESS"],
  [/creat(e|ing) (is )?(still )?in progress/i, "CREATE_IN_PROGRESS"],
  [/not found|does not exist|no such repo/i, "NOT_FOUND"],
  [/invalid repo(sitory)? name/i, "INVALID_REPO_NAME"],
  [/invalid ttl/i, "INVALID_TTL"],
];

export function artifactsErrorCode(err: unknown): ArtifactsErrorCode | undefined {
  if (!(err instanceof Error)) return undefined;
  const e = err as Partial<ArtifactsError>;
  if (typeof e.code === "string") return e.code as ArtifactsErrorCode;
  const m = /\b(ALREADY_EXISTS|NOT_FOUND|CREATE_IN_PROGRESS|IMPORT_IN_PROGRESS|FORK_IN_PROGRESS|INVALID_INPUT|INVALID_REPO_NAME|INVALID_TTL|INVALID_URL|REMOTE_AUTH_REQUIRED|UPSTREAM_UNAVAILABLE|MEMORY_LIMIT|INTERNAL_ERROR)\b/.exec(
    err.message,
  );
  if (m) return m[1] as ArtifactsErrorCode;
  if (e.name !== "ArtifactsError" && !err.message.startsWith("ArtifactsError")) return undefined;
  return MESSAGE_CODES.find(([re]) => re.test(err.message))?.[1] ?? "INTERNAL_ERROR";
}

/** Strip `?expires=` from a token so it can be used as a Git password or bearer. */
export function tokenSecret(token: string): string {
  return token.split("?expires=")[0]!;
}

/** Basic-auth remote for short-lived, one-off git commands. Never log the result. */
export function authRemote(remote: string, token: string): string {
  if (!remote.startsWith("https://")) throw new Error("Artifacts remotes are https URLs");
  return `https://x:${tokenSecret(token)}@${remote.slice("https://".length)}`;
}

/** Host and path of a remote, e.g. { host: "<acct>.artifacts.cloudflare.net", path: "/git/braid/x.git" }. */
export function remoteParts(remote: string): { host: string; path: string } {
  const u = new URL(remote);
  return { host: u.hostname, path: u.pathname.replace(/\/+$/, "") };
}

export interface RepoRef {
  name: string;
  remote: string;
  defaultBranch: string;
}

/** Create a repo, or return the existing one. */
export async function ensureRepo(
  artifacts: Artifacts,
  name: string,
  opts: { description?: string } = {},
): Promise<RepoRef & { created: boolean }> {
  try {
    const created = await artifacts.create(name, { description: opts.description, setDefaultBranch: "main" });
    return { name: created.name, remote: created.remote, defaultBranch: created.defaultBranch, created: true };
  } catch (err) {
    if (!isArtifactsError(err, "ALREADY_EXISTS")) throw err;
  }
  using repo = await artifacts.get(name);
  const info = await repo.info();
  return { name: info.name, remote: info.remote, defaultBranch: info.defaultBranch, created: false };
}

export async function repoInfo(artifacts: Artifacts, name: string): Promise<ArtifactsRepoInfo | null> {
  try {
    using repo = await artifacts.get(name);
    return await repo.info();
  } catch (err) {
    if (isArtifactsError(err, "NOT_FOUND")) return null;
    throw err;
  }
}

/** Fork `source` into `target`. Fails if `target` exists; callers decide whether to reuse or delete. */
export async function forkRepo(
  artifacts: Artifacts,
  source: string,
  target: string,
  description?: string,
): Promise<RepoRef> {
  using repo = await artifacts.get(source);
  const forked = await repo.fork(target, { description, defaultBranchOnly: true, readOnly: false });
  return { name: forked.name, remote: forked.remote, defaultBranch: forked.defaultBranch };
}

export async function mintToken(
  artifacts: Artifacts,
  name: string,
  scope: "read" | "write",
  ttlSeconds = TOKEN_TTL_SECONDS,
): Promise<ArtifactsCreateTokenResult> {
  using repo = await artifacts.get(name);
  return repo.createToken(scope, Math.min(ttlSeconds, TOKEN_TTL_SECONDS));
}

export async function deleteRepoIfExists(artifacts: Artifacts, name: string): Promise<boolean> {
  try {
    return await artifacts.delete(name);
  } catch (err) {
    if (isArtifactsError(err, "NOT_FOUND")) return false;
    throw err;
  }
}

/** Wait until a freshly forked/imported repo can be opened (get() throws while forking). */
export async function waitReady(artifacts: Artifacts, name: string, timeoutMs = 30_000): Promise<void> {
  const start = Date.now();
  for (let delay = 250; ; delay = Math.min(delay * 2, 2000)) {
    try {
      using repo = await artifacts.get(name);
      await repo.info();
      return;
    } catch (err) {
      const code = artifactsErrorCode(err);
      const pending = code === "FORK_IN_PROGRESS" || code === "IMPORT_IN_PROGRESS" || code === "CREATE_IN_PROGRESS";
      if (!pending || Date.now() - start > timeoutMs) throw err;
    }
    await new Promise((r) => setTimeout(r, delay));
  }
}

export async function readText(artifacts: Artifacts, name: string, ref: string, path: string): Promise<string | null> {
  using repo = await artifacts.get(name);
  const blob = await repo.readFile({ ref, path });
  return blob === null ? null : blob.text();
}

export async function headCommit(artifacts: Artifacts, name: string, ref = "main"): Promise<ArtifactsCommitMetadata | null> {
  using repo = await artifacts.get(name);
  const log = await repo.log({ ref, limit: 1 });
  return log[0] ?? null;
}
