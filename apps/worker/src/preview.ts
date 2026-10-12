// Previews: Scout shows running software, not just diffs.
//
// Each River's app is one Worker (deployed once from main). Every green push of a Channel is
// uploaded as a preview version with the alias `ch-<n>` (wrangler versions upload
// --preview-alias), giving it a stable URL like https://ch-3-riverlevels.<sub>.workers.dev.
// Browser Rendering screenshots it for Scout's side-by-side.
import puppeteer from "@cloudflare/puppeteer";
import { mintToken, remoteParts } from "./artifacts.ts";
import { previewsEnabled } from "./review.ts";
import { q, sandboxFor } from "./sandbox.ts";

/** Screenshot a preview URL into R2. Returns the R2 key. */
export async function screenshot(env: Env, url: string, key: string): Promise<string> {
  const browser = await puppeteer.launch(env.BROWSER as never);
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
    await page.goto(url, { waitUntil: "networkidle0", timeout: 30_000 });
    const png = (await page.screenshot({ type: "png" })) as Uint8Array;
    await env.BLOBS.put(key, png, { httpMetadata: { contentType: "image/png" } });
    return key;
  } finally {
    await browser.close();
  }
}

/** Deploy the River's main as its preview base Worker (once), so Channel versions can upload against it. */
export async function deployMain(env: Env, mainRepo: string, remote: string): Promise<{ ok: boolean; url: string | null; log: string }> {
  const e = env as Env & { CF_ACCOUNT_ID?: string };
  if (!previewsEnabled(env)) return { ok: false, url: null, log: "Set CF_ACCOUNT_ID and CLOUDFLARE_API_TOKEN to enable previews." };
  const token = await mintToken(env.ARTIFACTS, mainRepo, "read", 900);
  const { host, path } = remoteParts(remote);
  const sandbox = sandboxFor(env, `deploy:${mainRepo}`);
  await sandbox.grant(
    { artifactsHost: host, repos: { [path]: { token: token.plaintext, write: false } }, allowNpm: true, cfApi: { accountId: e.CF_ACCOUNT_ID! } },
    "standard-2",
  );
  const r = await sandbox.sh(
    [
      `rm -rf /workspace/main && git clone -q ${q(remote)} /workspace/main && cd /workspace/main`,
      "pnpm install --frozen-lockfile --reporter=silent || pnpm install --reporter=silent",
      `if node -e "process.exit(require('./package.json').scripts?.build ? 0 : 1)"; then pnpm build >/dev/null; fi`,
      "wrangler deploy 2>&1",
    ].join("\n"),
    {
      timeoutSec: 480,
      env: { CLOUDFLARE_API_TOKEN: "provided-by-worker", CLOUDFLARE_ACCOUNT_ID: e.CF_ACCOUNT_ID!, WRANGLER_SEND_METRICS: "false", CI: "1" },
    },
  );
  await sandbox.destroy();
  const url = /https:\/\/[a-z0-9.-]+\.workers\.dev/i.exec(r.stdout)?.[0] ?? null;
  return { ok: r.exitCode === 0, url, log: `${r.stdout}\n${r.stderr}`.slice(-3000) };
}
