import { describe, expect, it } from "vitest";
import {
  channelRepoName,
  confluenceRepoName,
  expandBraces,
  feedFamily,
  findOverlaps,
  formatLogbook,
  globsOverlap,
  logbookPath,
  mainRepoName,
  parseLogbook,
  parseLogbookPath,
  parseRepoName,
  parseTrailers,
  riskBand,
  slugify,
  trailerPairs,
  withTrailers,
} from "../src/index.ts";

describe("names", () => {
  it("builds and parses repo names", () => {
    expect(mainRepoName("riverlevels")).toBe("river-riverlevels");
    expect(channelRepoName("riverlevels", 6)).toBe("river-riverlevels--ch-6");
    expect(confluenceRepoName("riverlevels", "rate-limit-api", 1)).toBe("river-riverlevels--cf-rate-limit-api-1");
    expect(parseRepoName("river-riverlevels")).toEqual({ kind: "main", river: "riverlevels" });
    expect(parseRepoName("river-riverlevels--ch-6")).toEqual({ kind: "channel", river: "riverlevels", channel: "ch-6", n: 6 });
    expect(parseRepoName("river-my-app--cf-rate-limit-api-2")).toEqual({
      kind: "confluence",
      river: "my-app",
      intent: "rate-limit-api",
      attempt: 2,
    });
    expect(parseRepoName("braid-smoke").kind).toBe("other");
  });

  it("rejects double hyphens in slugs", () => {
    expect(() => mainRepoName("a--b")).toThrow();
  });

  it("slugifies titles", () => {
    expect(slugify("Add rate limiting to /api")).toBe("add-rate-limiting-to-api");
  });
});

describe("trailers", () => {
  it("round-trips and preserves unknown trailers", () => {
    const msg = withTrailers("Add token bucket\n\nBody text.\n\nCo-Authored-By: X <x@y>", {
      intent: "rate-limit-api",
      channel: "ch-5",
      agent: "claude-code",
      model: "claude-sonnet-5-5",
      logbook: "0012",
    });
    expect(msg).toContain("Co-Authored-By: X <x@y>");
    expect(msg).toContain("Body text.");
    expect(parseTrailers(msg)).toEqual({
      intent: "rate-limit-api",
      channel: "ch-5",
      agent: "claude-code",
      model: "claude-sonnet-5-5",
      logbook: "0012",
    });
    const again = withTrailers(msg, { cost: "$0.27", risk: "0.72" });
    expect(trailerPairs(parseTrailers(again)).map((p) => p.key)).toEqual([
      "Headwaters-Channel",
      "Headwaters-Intent",
      "Headwaters-Agent",
      "Headwaters-Model",
      "Headwaters-Cost",
      "Headwaters-Risk",
      "Logbook",
    ]);
  });

  it("treats a one-paragraph subject with a colon as body", () => {
    expect(parseTrailers("Fix: the gauge")).toEqual({});
    expect(withTrailers("Fix: the gauge", { channel: "ch-1" })).toBe("Fix: the gauge\n\nHeadwaters-Channel: ch-1\n");
  });
});

describe("lines", () => {
  it("detects the demo overlap on Gauge.tsx", () => {
    const live = [
      { channelId: "ch-2", glob: "src/theme/*", declaredAt: 1 },
      { channelId: "ch-2", glob: "src/components/Gauge.tsx", declaredAt: 1 },
    ];
    const overlaps = findOverlaps("ch-7", ["src/components/Gauge.tsx", "src/hooks/useGauge.ts"], live);
    expect(overlaps).toHaveLength(1);
    expect(overlaps[0]).toMatchObject({ channelId: "ch-2", path: "src/components/Gauge.tsx" });
  });

  it("intersects globs", () => {
    expect(globsOverlap("src/**", "src/components/Gauge.tsx")).toBe(true);
    expect(globsOverlap("src/*.ts", "src/*.tsx")).toBe(false);
    expect(globsOverlap("src/*.ts", "src/a*")).toBe(true);
    expect(globsOverlap("src/theme/", "src/theme/dark.css")).toBe(true);
    expect(globsOverlap("**/*.css", "src/theme/dark.css")).toBe(true);
    expect(globsOverlap("src/api/**", "src/components/**")).toBe(false);
    expect(globsOverlap("src/{api,lib}/x.ts", "src/lib/*")).toBe(true);
    expect(globsOverlap("./src\\hooks\\useGauge.ts", "src/hooks/*")).toBe(true);
  });

  it("ignores a channel's own lines", () => {
    expect(findOverlaps("ch-1", ["src/**"], [{ channelId: "ch-1", glob: "src/a.ts", declaredAt: 0 }])).toEqual([]);
  });

  it("expands braces", () => {
    expect(expandBraces("a/{b,c/{d,e}}.ts")).toEqual(["a/b.ts", "a/c/d.ts", "a/c/e.ts"]);
  });
});

describe("logbook", () => {
  it("formats and parses", () => {
    const md = formatLogbook({
      number: "0012",
      meta: { intent: "rate-limit-api", channel: "ch-5", agent: "claude-code", model: "claude-sonnet-5-5", costUsd: 0.27 },
      plan: "Add a token-bucket limiter in front of /api.",
      decisions: ["10 req/s per token.", "Return 429 with retryAfter."],
      rejected: ["In-memory map per isolate."],
      notes: "Check the Durable Object binding.",
    });
    const e = parseLogbook(md, "0012");
    expect(e.meta.costUsd).toBe(0.27);
    expect(e.meta.agent).toBe("claude-code");
    expect(e.decisions).toEqual(["10 req/s per token.", "Return 429 with retryAfter."]);
    expect(e.rejected).toEqual(["In-memory map per isolate."]);
    expect(e.notes).toBe("Check the Durable Object binding.");
    expect(logbookPath(12, "ch-5")).toBe(".headwaters/logbook/0012-ch-5.md");
    expect(parseLogbookPath(".headwaters/logbook/0012-ch-5.md")).toEqual({ number: "0012", channel: "ch-5" });
  });
});

describe("events and risk", () => {
  it("maps families", () => {
    expect(feedFamily({ type: "confluence.picked", by: "you" })).toBe("human");
    expect(feedFamily({ type: "confluence.picked", by: "auto" })).toBe("merged");
    expect(feedFamily({ type: "repo.forked" })).toBe("meta");
    expect(feedFamily({ type: "line.conflict" })).toBe("conflict");
  });
  it("bands risk", () => {
    expect(riskBand(0.18)).toBe("low");
    expect(riskBand(0.44)).toBe("mid");
    expect(riskBand(0.6)).toBe("high");
  });
});
