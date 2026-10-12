import { useEffect, useState } from "react";
import { prefersReducedMotion } from "../theme.ts";

/** A clock for relative timestamps: frozen in fixture mode, ticking every 5s otherwise. */
export function useNow(frozen?: number): number {
  const [now, setNow] = useState(() => frozen ?? Date.now());
  useEffect(() => {
    if (frozen !== undefined) {
      setNow(frozen);
      return;
    }
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, [frozen]);
  return now;
}

/** prefers-reduced-motion, kept live. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(prefersReducedMotion);
  useEffect(() => {
    if (typeof matchMedia === "undefined") return;
    const mq = matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

/** Set the document title for the current screen. */
export function useTitle(title: string): void {
  useEffect(() => {
    document.title = title;
  }, [title]);
}
