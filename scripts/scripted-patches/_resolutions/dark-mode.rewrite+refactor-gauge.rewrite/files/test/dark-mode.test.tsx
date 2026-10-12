import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { App } from "../src/App";
import { RIVERS } from "../src/api/data";
import { GAUGE_COLORS, Gauge } from "../src/components/Gauge";
import { RiverCard } from "../src/components/RiverCard";

const snake = RIVERS.find((r) => r.id === "snake-moose")!;

describe("dark mode", () => {
  it("draws the gauge in dark colors", () => {
    const html = renderToString(<Gauge kind="flow" label="Flow" scheme="dark" reading={snake.flow} />);
    expect(html).toContain(`background:${GAUGE_COLORS.dark.bar}`);
    expect(html).toContain(`background:${GAUGE_COLORS.dark.track}`);
    expect(html).toContain(`color:${GAUGE_COLORS.dark.value}`);
    expect(html).toContain(">4,810 cfs</button>");
  });

  it("keeps the alert visible in the dark", () => {
    const html = renderToString(
      <Gauge kind="stage" label="Stage" scheme="dark" reading={{ ...snake.stage, value: 9.4 }} />,
    );
    expect(html).toContain('data-alert="true"');
    expect(html).toContain(`background:${GAUGE_COLORS.dark.alert}`);
    expect(html).toContain(`background:${GAUGE_COLORS.dark.alertTrack}`);
  });

  it("puts dark cards on a dark page", () => {
    const html = renderToString(<App initialRivers={RIVERS} initialScheme="dark" />);
    expect(html).toContain('data-scheme="dark"');
    expect(html).toContain("background:#0c0a09");
    expect(html.split("background:#1c1917").length - 1).toBe(RIVERS.length);
    expect(html).not.toContain(GAUGE_COLORS.light.bar);
  });

  it("stays light by default", () => {
    const html = renderToString(<RiverCard river={snake} />);
    expect(html).toContain("background:#ffffff");
    expect(html).toContain(`background:${GAUGE_COLORS.light.bar}`);
    expect(html).not.toContain(GAUGE_COLORS.dark.bar);
  });
});
