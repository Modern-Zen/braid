// The light palette. theme.css mirrors these values as CSS custom properties for
// the page chrome; the Gauge reads them here because its bar color depends on the
// reading (alert or not) and its track is a tint of that color, both set inline.

export interface Palette {
  bg: string;
  surface: string;
  ink: string;
  muted: string;
  line: string;
  bar: string;
  alert: string;
}

export const palette: Palette = {
  bg: "#f5f5f4",
  surface: "#ffffff",
  ink: "#1c1917",
  muted: "#78716c",
  line: "#e7e5e4",
  bar: "#0d9488",
  alert: "#c2410c",
};
