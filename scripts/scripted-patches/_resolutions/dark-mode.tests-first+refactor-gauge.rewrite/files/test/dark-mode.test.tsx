import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { App } from "../src/App";
import { RIVERS } from "../src/api/data";
import { Gauge, type GaugeProps } from "../src/components/Gauge";
import { ThemeProvider, resolveTheme } from "../src/theme/ThemeContext";
import { ThemeToggle } from "../src/theme/ThemeToggle";
import { dark, light, type Palette } from "../src/theme/tokens";

/** WCAG contrast ratio of two #rrggbb colors. */
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

const stage: GaugeProps = {
  kind: "stage",
  label: "Stage",
  reading: { value: 6.2, unit: "ft", min: 0, max: 10, alertAt: 9 },
};

describe("resolveTheme", () => {
  it("prefers a saved choice over the system setting", () => {
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme("light", true)).toBe("light");
  });

  it("follows the system when nothing valid is saved", () => {
    expect(resolveTheme(null, true)).toBe("dark");
    expect(resolveTheme(null, false)).toBe("light");
    expect(resolveTheme("sepia", true)).toBe("dark");
  });
});

describe("dark palette", () => {
  it("defines every token the light palette has", () => {
    expect(Object.keys(dark).sort()).toEqual(Object.keys(light).sort());
    for (const value of Object.values(dark)) expect(value).toMatch(/^#[0-9a-f]{6}$/);
  });

  it.each([
    ["light", light],
    ["dark", dark],
  ] as Array<[string, Palette]>)("keeps WCAG contrast on %s cards", (_, p) => {
    expect(contrast(p.ink, p.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(p.muted, p.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(p.bar, p.surface)).toBeGreaterThanOrEqual(3);
    expect(contrast(p.alert, p.surface)).toBeGreaterThanOrEqual(3);
  });
});

describe("themed gauge", () => {
  it("uses the light palette by default", () => {
    const html = renderToString(<Gauge {...stage} />);
    expect(html).toContain(`background:${light.bar}`);
    expect(html).toContain(`color:${light.ink}`);
  });

  it("uses the dark palette inside a dark ThemeProvider", () => {
    const html = renderToString(
      <ThemeProvider value="dark">
        <Gauge {...stage} reading={{ ...stage.reading, value: 9.5 }} />
      </ThemeProvider>,
    );
    expect(html).toContain(`background:${dark.alert}`);
    expect(html).toContain(`color:${dark.ink}`);
    expect(html).not.toContain(light.ink);
  });
});

describe("theme toggle", () => {
  it("reports its state with aria-pressed", () => {
    expect(renderToString(<ThemeToggle theme="dark" onChange={() => {}} />)).toContain('aria-pressed="true"');
    expect(renderToString(<ThemeToggle theme="light" onChange={() => {}} />)).toContain('aria-pressed="false"');
  });

  it("sits on the page, which carries the active theme", () => {
    const html = renderToString(<App initialRivers={RIVERS} initialTheme="dark" />);
    expect(html).toContain('data-theme="dark"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain(`background:${dark.bar}`);
  });
});
