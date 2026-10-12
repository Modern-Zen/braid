import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Gauge, type GaugeProps } from "../src/components/Gauge";
import { palette } from "../src/theme/tokens";

const stage: GaugeProps = { kind: "stage", label: "Stage", value: 6.2, min: 0, max: 10, alertAt: 9 };
const flow: GaugeProps = { kind: "flow", label: "Flow", value: 4810, min: 0, max: 10000 };
const temp: GaugeProps = { kind: "temp", label: "Temp", value: 51, min: 32, max: 86 };

const html = (props: GaugeProps) => renderToString(<Gauge {...props} />);

describe("Gauge", () => {
  it("formats stage in feet with one decimal", () => {
    expect(html(stage)).toContain(">6.2 ft</button>");
    expect(html({ ...stage, value: 7 })).toContain(">7.0 ft</button>");
  });

  it("formats flow with a thousands separator", () => {
    expect(html(flow)).toContain(">4,810 cfs</button>");
  });

  it("formats temperature as whole degrees", () => {
    expect(html(temp)).toContain(">51°F</button>");
    expect(html({ ...temp, value: 51.6 })).toContain(">52°F</button>");
  });

  it("shows metric units when asked", () => {
    expect(html({ ...stage, defaultUnits: "metric" })).toContain(">1.9 m</button>");
    expect(html({ ...flow, defaultUnits: "metric" })).toContain(">136.2 m³/s</button>");
    expect(html({ ...temp, defaultUnits: "metric" })).toContain(">11°C</button>");
  });

  it("draws the bar as the reading's share of the range, clamped to 0–100%", () => {
    expect(html(stage)).toContain("width:62%");
    expect(html(temp)).toContain("width:35%");
    expect(html({ ...stage, value: 12 })).toContain("width:100%");
    expect(html({ ...stage, value: -1 })).toContain("width:0%");
    expect(html({ ...stage, min: 5, max: 5 })).toContain("width:0%");
  });

  it("switches to the alert color at the alert threshold", () => {
    const calm = html(stage);
    expect(calm).not.toContain("data-alert");
    expect(calm).toContain(`background:${palette.bar}`);

    const high = html({ ...stage, value: 9 });
    expect(high).toContain('data-alert="true"');
    expect(high).toContain(`background:${palette.alert}`);
  });
});
