// A tiny history router for the app. Four screens under /app/:
//   /app/                 A · River
//   /app/scout/:intent?   B · Scout
//   /app/eddy             C · Eddy
//   /app/logbook/:sha?    D · Logbook   (?repo=<artifacts repo>)
// The recording/demo flags (?fixtures=1, ?states=1, ?river=) ride along on every link.
import { useCallback, useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent, type ReactElement } from "react";

export type Screen = "river" | "scout" | "eddy" | "logbook";

export type Route =
  | { screen: "river" }
  | { screen: "scout"; intent?: string }
  | { screen: "eddy" }
  | { screen: "logbook"; sha?: string; repo?: string };

const BASE = "/app";
/** Query params that persist across navigation. */
const STICKY = ["fixtures", "states", "river"] as const;

export function parseRoute(pathname: string, search: string): Route {
  const rest = pathname.startsWith(BASE) ? pathname.slice(BASE.length) : pathname;
  const parts = rest.split("/").filter(Boolean).map(decodeURIComponent);
  const q = new URLSearchParams(search);
  switch (parts[0]) {
    case "scout":
      return parts[1] ? { screen: "scout", intent: parts[1] } : { screen: "scout" };
    case "eddy":
      return { screen: "eddy" };
    case "logbook": {
      const route: Route = { screen: "logbook" };
      if (parts[1]) route.sha = parts[1];
      const repo = q.get("repo");
      if (repo) route.repo = repo;
      return route;
    }
    default:
      return { screen: "river" };
  }
}

/** Build an href for a route, keeping the sticky query params of the current URL. */
export function href(route: Route): string {
  let path = `${BASE}/`;
  const q = new URLSearchParams();
  const current = new URLSearchParams(location.search);
  for (const k of STICKY) {
    const v = current.get(k);
    if (v !== null) q.set(k, v);
  }
  switch (route.screen) {
    case "scout":
      path += route.intent ? `scout/${encodeURIComponent(route.intent)}` : "scout";
      break;
    case "eddy":
      path += "eddy";
      break;
    case "logbook":
      path += route.sha ? `logbook/${encodeURIComponent(route.sha)}` : "logbook";
      if (route.repo) q.set("repo", route.repo);
      break;
    default:
      break;
  }
  const qs = q.toString();
  return qs ? `${path}?${qs}` : path;
}

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

if (typeof window !== "undefined") window.addEventListener("popstate", notify);

export function navigate(to: string | Route, opts: { replace?: boolean } = {}): void {
  const url = typeof to === "string" ? to : href(to);
  if (url === location.pathname + location.search) return;
  if (opts.replace) history.replaceState(null, "", url);
  else history.pushState(null, "", url);
  notify();
  document.querySelector("main")?.scrollTo({ top: 0 });
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};
const snapshot = () => location.pathname + location.search;

/** The current route; re-renders on push/pop. */
export function useRoute(): Route {
  const key = useSyncExternalStore(subscribe, snapshot, snapshot);
  const i = key.indexOf("?");
  return parseRoute(i === -1 ? key : key.slice(0, i), i === -1 ? "" : key.slice(i));
}

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & { to: Route };

/** An anchor that navigates client-side (modifier clicks still open a new tab). */
export function Link({ to, onClick, ...rest }: LinkProps): ReactElement {
  const target = href(to);
  const handle = useCallback(
    (e: MouseEvent<HTMLAnchorElement>) => {
      onClick?.(e);
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      navigate(target);
    },
    [onClick, target],
  );
  return <a href={target} onClick={handle} {...rest} />;
}
