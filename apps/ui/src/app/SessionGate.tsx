// Auth gate. On load: GET /api/session. 401 → a small sign-in panel that POSTs the
// operator token to /api/session (which sets the cookie the REST API and the River
// socket use), then remounts the app so every request runs again. Behind Cloudflare
// Access the check passes and this never shows. Fixture mode skips it entirely.
import { useEffect, useId, useState, type FormEvent, type ReactElement, type ReactNode } from "react";
import { BraidMark } from "../components/BraidMark.tsx";
import { buttonClass, buttonStyle } from "../components/buttons.ts";
import { ApiError, getSession, signIn, type SessionStatus } from "./data/api.ts";
import { readParams } from "./data/params.ts";

export function SessionGate({ children }: { children: (session: number) => ReactNode }): ReactElement {
  const fixtures = readParams().fixtures;
  const [status, setStatus] = useState<SessionStatus | "checking">(fixtures ? "ok" : "checking");
  // Bumped after sign-in: remounts the app, so the socket and every resource reload.
  const [session, setSession] = useState(0);

  useEffect(() => {
    if (fixtures) return;
    let live = true;
    getSession().then((s) => live && setStatus(s));
    return () => {
      live = false;
    };
  }, [fixtures]);

  if (status === "checking") return <div style={{ minHeight: "100vh", background: "var(--hw-color-paper)" }} />;
  if (status === "signin") {
    return (
      <SignIn
        onSignedIn={() => {
          setSession((n) => n + 1);
          setStatus("ok");
        }}
      />
    );
  }
  return <>{children(session)}</>;
}

function SignIn({ onSignedIn }: { onSignedIn: () => void }): ReactElement {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = useId();

  useEffect(() => {
    document.title = "Sign in · Headwaters";
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await signIn(token.trim());
      setToken("");
      onSignedIn();
    } catch (err) {
      setError(err instanceof ApiError && (err.status === 401 || err.status === 403) ? "That token didn’t work." : "Couldn’t reach Headwaters. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: "var(--hw-color-paper)",
        color: "var(--hw-color-ink)",
        fontFamily: "var(--hw-font-ui)",
        fontSize: 14,
        lineHeight: 1.5,
      }}
    >
      <form
        onSubmit={submit}
        aria-labelledby={`${id}-h`}
        style={{
          width: "100%",
          maxWidth: 380,
          background: "var(--hw-color-surface)",
          border: "1px solid var(--hw-color-line)",
          borderRadius: "var(--hw-radius-lg)",
          boxShadow: "var(--hw-shadow-sm)",
          padding: "28px 28px 24px",
          display: "flex",
          flexDirection: "column",
          gap: 18,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <span style={{ color: "var(--hw-color-ink)" }}>
            <BraidMark size={26} />
          </span>
          <h1 id={`${id}-h`} style={{ margin: 0, fontFamily: "var(--hw-font-display)", fontWeight: 500, fontSize: 22, letterSpacing: "-0.01em" }}>
            Sign in to Headwaters
          </h1>
        </div>
        <label style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--hw-color-ink-3)" }}>Operator token</span>
          <input
            className="hw-field"
            type="password"
            autoComplete="current-password"
            autoFocus
            value={token}
            onChange={(e) => setToken(e.target.value)}
            required
          />
        </label>
        {error ? (
          <p role="alert" style={{ margin: 0, fontSize: 13, color: "var(--hw-color-conflict)" }}>
            {error}
          </p>
        ) : null}
        <button type="submit" className={buttonClass("primary")} style={{ ...buttonStyle("primary", "13px 20px"), width: "100%" }} disabled={busy || !token.trim()} aria-busy={busy}>
          Continue
        </button>
      </form>
    </main>
  );
}
