import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { App } from "../src/App";
import { RiverCard } from "../src/components/RiverCard";
import { RIVERS } from "../src/api/data";
import type { LevelsResponse } from "../src/types";
import { app } from "../src/worker";

const count = (html: string, needle: string) => html.split(needle).length - 1;

describe("server render", () => {
  it("renders a card for every river the API returns", async () => {
    const body = (await (await app.request("/api/levels")).json()) as LevelsResponse;
    const html = renderToString(<App initialRivers={body.rivers} />);
    expect(html).toContain("<h1>River levels</h1>");
    expect(count(html, 'class="river-card"')).toBe(body.rivers.length);
    expect(count(html, 'role="meter"')).toBe(body.rivers.length * 3);
  });

  it("shows a river's name, site, three gauges and update time", () => {
    const snake = RIVERS.find((r) => r.id === "snake-moose")!;
    const html = renderToString(<RiverCard river={snake} />);
    expect(html).toContain(">Snake River</h2>");
    expect(html).toContain(">Moose, WY</span>");
    expect(count(html, 'role="meter"')).toBe(3);
    expect(html).toContain('aria-valuetext="6.2 ft"');
    expect(html).toContain('aria-valuetext="4,810 cfs"');
    expect(html).toContain('aria-valuetext="51°F"');
    expect(html).toContain("Updated 14:00 UTC");
  });

  it("shows a loading state before the first response", () => {
    const html = renderToString(<App />);
    expect(html).toContain("Loading gauges…");
    expect(html).not.toContain("river-card");
  });
});
