// Stat counter: the calm counter. Small in the top bar, large on Eddy and the landing page.
// The last item is the only amber, and only when something needs a person.
//   Top bar  Inter 13 ink-2, separators ink-4
//   Eddy     Lora 500 40/1.15, tracking −0.02em
//   Landing  Lora 500 clamp(48–80), tabular-nums
//   Animate  count up 1600ms ease-out cubic on enter
//   Zero     "nothing for you", ink-3, no amber
import { useEffect, useRef, useState, type CSSProperties, type ReactElement } from "react";
import { decisionLabel } from "@braid/protocol";
import { plural } from "../lib/format.ts";
import { prefersReducedMotion } from "../theme.ts";

export interface Counts {
  agents: number;
  commits: number;
  previews: number;
  decisions: number;
}

/** Ease numbers toward their targets: 1600ms, ease-out cubic. Starts from 0 on mount. */
export function useCountUp(targets: number[], { duration = 1600, start = true }: { duration?: number; start?: boolean } = {}): number[] {
  const [shown, setShown] = useState<number[]>(() => targets.map(() => 0));
  const shownRef = useRef(shown);
  shownRef.current = shown;
  const key = targets.join(",");

  useEffect(() => {
    if (!start) return;
    const to = key.split(",").map(Number);
    // Reduced motion, or a hidden tab (rAF doesn't run there): land on the numbers directly.
    if (prefersReducedMotion() || document.visibilityState !== "visible") {
      setShown(to);
      return;
    }
    const from = shownRef.current;
    if (from.length === to.length && from.every((v, i) => v === to[i])) return;
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      const e = 1 - Math.pow(1 - p, 3);
      setShown(to.map((v, i) => Math.round((from[i] ?? 0) + (v - (from[i] ?? 0)) * e)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    // Backstop: a window that isn't painting never runs rAF. Land on the numbers anyway.
    const done = setTimeout(() => {
      cancelAnimationFrame(raf);
      setShown(to);
    }, duration + 100);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(done);
    };
  }, [key, start, duration]);

  return shown;
}

const sep = <span style={{ color: "var(--hw-color-ink-4)" }}>·</span>;

const decisionColor = (n: number) => (n > 0 ? "var(--hw-color-human)" : "var(--hw-color-ink-3)");

export interface StatCounterProps extends Counts {
  variant: "topbar" | "eddy" | "landing";
  style?: CSSProperties;
}

export function StatCounter(props: StatCounterProps): ReactElement {
  if (props.variant === "landing") return <LandingCounter {...props} />;
  return <InlineCounter {...props} />;
}

function InlineCounter({ variant, agents, commits, previews, decisions, style }: StatCounterProps): ReactElement {
  const [a, c, p] = useCountUp([agents, commits, previews]);
  const label = decisionLabel(decisions);
  if (variant === "eddy") {
    return (
      <div
        style={{
          fontFamily: "var(--hw-font-display)",
          fontWeight: 500,
          fontSize: 40,
          lineHeight: 1.15,
          letterSpacing: "-0.02em",
          fontVariantNumeric: "tabular-nums",
          ...style,
        }}
      >
        {plural(a ?? 0, "agent")} {sep} {plural(c ?? 0, "commit")} {sep} <span style={{ color: decisionColor(decisions) }}>{label}.</span>
      </div>
    );
  }
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: 10,
        fontSize: 13,
        color: "var(--hw-color-ink-2)",
        fontVariantNumeric: "tabular-nums",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      <span>{plural(a ?? 0, "agent")}</span>
      {sep}
      <span>{plural(c ?? 0, "commit")}</span>
      {sep}
      <span>{plural(p ?? 0, "preview")}</span>
      {sep}
      <span style={{ color: decisionColor(decisions), fontWeight: 500 }}>{label}</span>
    </div>
  );
}

function LandingCounter({ agents, commits, previews, decisions, style }: StatCounterProps): ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  const [start, setStart] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setStart(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setStart(true);
          io.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const shown = useCountUp([agents, commits, previews, decisions], { start });
  const big: CSSProperties = {
    fontFamily: "var(--hw-font-display)",
    fontWeight: 500,
    fontSize: "clamp(48px, 6vw, 80px)",
    lineHeight: 1,
    letterSpacing: "-0.03em",
    fontVariantNumeric: "tabular-nums",
  };
  const small: CSSProperties = { marginTop: 12, fontSize: 14, color: "var(--hw-color-ink-3)" };
  const human = decisions > 0;
  const items: Array<[number, string, boolean]> = [
    [shown[0] ?? 0, agents === 1 ? "agent" : "agents", false],
    [shown[1] ?? 0, commits === 1 ? "commit" : "commits", false],
    [shown[2] ?? 0, previews === 1 ? "preview" : "previews", false],
    [shown[3] ?? 0, decisions === 0 ? "nothing for you" : decisions === 1 ? "decision for you" : "decisions for you", human],
  ];
  return (
    <div
      ref={ref}
      style={{
        maxWidth: "var(--hw-container-max)",
        margin: "0 auto",
        padding: "64px var(--hw-container-pad)",
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        gap: 32,
        ...style,
      }}
    >
      {items.map(([n, label, amber], i) => (
        <div key={i}>
          <div style={{ ...big, ...(i === 3 ? { color: amber ? "var(--hw-color-human)" : "var(--hw-color-ink-3)" } : {}) }}>{n}</div>
          <div style={{ ...small, ...(amber ? { color: "var(--hw-color-human)" } : {}) }}>{label}</div>
        </div>
      ))}
    </div>
  );
}
