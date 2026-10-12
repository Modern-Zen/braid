// Artifacts repo naming. One namespace (`braid`), many repos:
//   river-<slug>                         mainline
//   river-<slug>--ch-<n>                 a Channel (one agent's attempt), n is River-wide
//   river-<slug>--cf-<intent>-<attempt>  a Confluence fork (merge resolution, never in place)
// Slugs never contain `--`, so the separator parses unambiguously.

export const ARTIFACTS_NAMESPACE = "braid";

const SLUG = /^[a-z0-9](?:[a-z0-9]|-(?!-))*[a-z0-9]$|^[a-z0-9]$/;
const REPO_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function isSlug(value: string): boolean {
  return SLUG.test(value) && value.length <= 40;
}

export function assertSlug(value: string, what = "slug"): string {
  if (!isSlug(value)) {
    throw new Error(`Invalid ${what} "${value}": use lowercase letters, digits and single hyphens`);
  }
  return value;
}

export function isRepoName(value: string): boolean {
  return REPO_NAME.test(value) && value.length <= 100;
}

/** Turn free text ("Add rate limiting to /api") into a slug ("add-rate-limiting-to-api"). */
export function slugify(text: string, max = 32): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "");
  return slug || "intent";
}

export function mainRepoName(river: string): string {
  return `river-${assertSlug(river, "river slug")}`;
}

export function channelId(n: number): string {
  if (!Number.isInteger(n) || n < 1) throw new Error(`Invalid channel number ${n}`);
  return `ch-${n}`;
}

export function channelNumber(id: string): number {
  const m = /^ch-(\d+)$/.exec(id);
  if (!m) throw new Error(`Invalid channel id "${id}"`);
  return Number(m[1]);
}

export function channelRepoName(river: string, n: number): string {
  return `${mainRepoName(river)}--${channelId(n)}`;
}

export function confluenceRepoName(river: string, intent: string, attempt: number): string {
  assertSlug(intent, "intent slug");
  if (!Number.isInteger(attempt) || attempt < 1) throw new Error(`Invalid attempt ${attempt}`);
  return `${mainRepoName(river)}--cf-${intent}-${attempt}`;
}

export type ParsedRepoName =
  | { kind: "main"; river: string }
  | { kind: "channel"; river: string; channel: string; n: number }
  | { kind: "confluence"; river: string; intent: string; attempt: number }
  | { kind: "other"; name: string };

export function parseRepoName(name: string): ParsedRepoName {
  const m = /^river-([a-z0-9-]+?)(?:--(.+))?$/.exec(name);
  if (!m || !isSlug(m[1]!)) return { kind: "other", name };
  const river = m[1]!;
  const rest = m[2];
  if (rest === undefined) return { kind: "main", river };
  const ch = /^ch-(\d+)$/.exec(rest);
  if (ch) return { kind: "channel", river, channel: `ch-${ch[1]}`, n: Number(ch[1]) };
  const cf = /^cf-([a-z0-9-]+)-(\d+)$/.exec(rest);
  if (cf && isSlug(cf[1]!)) return { kind: "confluence", river, intent: cf[1]!, attempt: Number(cf[2]) };
  return { kind: "other", name };
}

/** Preview hostname for a Channel, e.g. ch-3.braid.drp.icu. */
export function previewHost(channel: string, baseDomain: string): string {
  return `${channel}.${baseDomain}`;
}
