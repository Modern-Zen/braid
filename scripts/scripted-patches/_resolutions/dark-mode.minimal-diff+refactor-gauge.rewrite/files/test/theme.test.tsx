import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Gauge } from "../src/components/Gauge";
import { dark, light, type Palette } from "../src/theme/tokens";

/** WCAG relative luminance contrast ratio of two #rrggbb colors. */
function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

describe("theme tokens", () => {
  it("has a dark value for every light token", () => {
    expect(Object.keys(dark).sort()).toEqual(Object.keys(light).sort());
  });

  it("leaves the gauge's colors to the active theme", () => {
    const html = renderToString(
      <Gauge kind="stage" label="Stage" reading={{ value: 9.2, unit: "ft", min: 0, max: 10, alertAt: 9 }} />,
    );
    const styles = [...html.matchAll(/style="([^"]*)"/g)].map((m) => m[1]).join(";");
    expect(styles).toContain("var(--rl-alert)");
    expect(styles).not.toMatch(/#[0-9a-f]{3,8}/i);
  });

  it.each([
    ["light", light],
    ["dark", dark],
  ] as Array<[string, Palette]>)("keeps text readable on the %s cards", (_, p) => {
    expect(contrast(p.ink, p.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(p.muted, p.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(p.bar, p.surface)).toBeGreaterThanOrEqual(3);
    expect(contrast(p.alert, p.surface)).toBeGreaterThanOrEqual(3);
  });
});
