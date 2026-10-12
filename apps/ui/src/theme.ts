import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark";

function current(): Theme {
  return document.documentElement.getAttribute("data-hw-theme") === "dark" ? "dark" : "light";
}

/** Theme lives on <html data-hw-theme>. Follows the OS until the user toggles. */
export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(current);

  useEffect(() => {
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (localStorage.getItem("hw-theme")) return;
      const next: Theme = mq.matches ? "dark" : "light";
      document.documentElement.setAttribute("data-hw-theme", next);
      setTheme(next);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const toggle = useCallback(() => {
    const next: Theme = current() === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-hw-theme", next);
    try {
      localStorage.setItem("hw-theme", next);
    } catch {
      // Private mode: the toggle still works for this page.
    }
    setTheme(next);
  }, []);

  return [theme, toggle];
}

export const prefersReducedMotion = (): boolean =>
  typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
