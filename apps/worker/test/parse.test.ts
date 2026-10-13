import { describe, expect, it } from "vitest";
import { patchFiles, patchMessage } from "../src/agents/adapters/recorded.ts";
import { heuristicRisk, parseNumstat, parseTestOutput, parseUnifiedDiff, pickPreviewUrl } from "../src/parse.ts";

describe("parseTestOutput", () => {
  it("reads a green vitest summary, not the Test Files line", () => {
    const log = ` ✓ test/api.test.ts (6 tests) 12ms\n\n Test Files  3 passed (3)\n      Tests  14 passed (14)\n   Start at  12:00:00\n`;
    expect(parseTestOutput(log, 0)).toMatchObject({ passed: 14, total: 14 });
  });

  it("reads failures", () => {
    const log = ` × gauge > keeps contrast 3ms\n × gauge > dark labels 2ms\n\n Test Files  1 failed | 2 passed (3)\n      Tests  2 failed | 12 passed (14)\n`;
    const r = parseTestOutput(log, 1);
    expect(r).toMatchObject({ passed: 12, total: 14 });
    expect(r.failures).toEqual(["gauge > keeps contrast 3ms", "gauge > dark labels 2ms"]);
  });

  it("counts a test file that failed to load", () => {
    const log = ` FAIL  test/dark-mode.test.tsx [ test/dark-mode.test.tsx ]
Error: Failed to resolve import "../src/theme/dark"

 Test Files  1 failed | 3 passed (4)
      Tests  14 passed (14)
`;
    const r = parseTestOutput(log, 1);
    expect(r).toMatchObject({ passed: 14, total: 15 });
    expect(r.failures).toContain("1 test file failed to run");
  });

  it("never reports green on a non-zero exit", () => {
    expect(parseTestOutput("      Tests  14 passed (14)\n", 1)).toMatchObject({ passed: 14, total: 15 });
  });

  it("reads jest and strips colors", () => {
    expect(parseTestOutput("\u001b[1mTests:\u001b[22m       1 failed, 9 passed, 10 total", 1)).toMatchObject({ passed: 9, total: 10 });
  });

  it("falls back to the exit code", () => {
    expect(parseTestOutput("ok", 0)).toMatchObject({ passed: 1, total: 1 });
    expect(parseTestOutput("boom", 2)).toMatchObject({ passed: 0, total: 1 });
  });
});

describe("diffs", () => {
  it("sums numstat", () => {
    const { diff, paths } = parseNumstat("18\t1\tsrc/api/middleware/rateLimit.ts\n-\t-\tlogo.png\n4\t0\tsrc/api/index.ts\n");
    expect(diff).toEqual({ added: 22, removed: 1, files: 3 });
    expect(paths).toContain("logo.png");
  });

  it("parses a unified diff with line numbers", () => {
    const files = parseUnifiedDiff(
      [
        "diff --git a/src/api/index.ts b/src/api/index.ts",
        "index 1111111..2222222 100644",
        "--- a/src/api/index.ts",
        "+++ b/src/api/index.ts",
        "@@ -16,3 +16,3 @@ export const api = new Hono();",
        " ",
        "-api.get(\"/levels\", levels);",
        "+api.get(\"/levels\", cache(60), levels);",
        " export default api;",
      ].join("\n"),
    );
    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({ path: "src/api/index.ts", added: 1, removed: 1 });
    expect(files[0]!.lines.map((l) => `${l.n}${l.sign}`)).toEqual(["16 ", "17-", "17+", "18 "]);
  });
});

describe("previews and risk", () => {
  it("prefers the alias URL", () => {
    const out = `Uploaded riverlevels (1.2 sec)\nWorker Version ID: abc\nVersion Preview URL: https://3f2a1b-riverlevels.modernzen.workers.dev\nVersion Preview Alias URL: https://ch-3-riverlevels.modernzen.workers.dev`;
    expect(pickPreviewUrl(out, "ch-3")).toBe("https://ch-3-riverlevels.modernzen.workers.dev");
    expect(pickPreviewUrl("no url here", "ch-3")).toBeNull();
  });

  it("scores the public API surface and config as risky", () => {
    const api = heuristicRisk(["src/api/index.ts", "src/api/limiter.ts", "wrangler.jsonc"], { added: 120, removed: 4, files: 3 }, { passed: 14, total: 14 });
    const theme = heuristicRisk(["src/theme/tokens.css"], { added: 40, removed: 6, files: 1 }, { passed: 14, total: 14 });
    expect(api.risk).toBeGreaterThanOrEqual(0.6);
    expect(theme.risk).toBeLessThan(0.4);
  });
});

describe("recorded patches", () => {
  const patch = `From 1234567890abcdef1234567890abcdef12345678 Mon Sep 17 00:00:00 2001
From: Headwaters <agents@braid.drp.icu>
Date: Mon, 12 Oct 2026 09:10:00 +0000
Subject: [PATCH 2/3] Add a theme-token layer and respect
 prefers-color-scheme

Tokens live in src/theme/tokens.css.
---
 src/components/Gauge.tsx | 4 ++--
 src/theme/tokens.css     | 12 ++++++++++++
 2 files changed, 14 insertions(+), 2 deletions(-)

diff --git a/src/components/Gauge.tsx b/src/components/Gauge.tsx
index 1111111..2222222 100644
--- a/src/components/Gauge.tsx
+++ b/src/components/Gauge.tsx
@@ -1 +1 @@
-a
+b
diff --git a/src/theme/tokens.css b/src/theme/tokens.css
new file mode 100644
`;
  it("reads subject (wrapped) and body", () => {
    expect(patchMessage(patch)).toEqual({
      subject: "Add a theme-token layer and respect prefers-color-scheme",
      body: "Tokens live in src/theme/tokens.css.",
    });
  });
  it("lists files", () => {
    expect(patchFiles(patch)).toEqual(["src/components/Gauge.tsx", "src/theme/tokens.css"]);
  });
});
