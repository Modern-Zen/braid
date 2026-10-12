// "Open an Intent": title + goal → POST /api/rivers/:id/intents (OpenIntentRequest).
// The River policy decides strategies and the number of Channels.
import { useEffect, useId, useRef, useState, type FormEvent, type ReactElement } from "react";
import type { OpenIntentRequest } from "@braid/protocol";
import { buttonClass, buttonStyle } from "../../components/buttons.ts";
import { openIntent } from "../data/api.ts";

export interface OpenIntentDialogProps {
  riverId: string;
  /** Fixture mode: nothing is sent. */
  fixtures: boolean;
  onClose: () => void;
  onOpened?: (intentId: string | null) => void;
}

export function OpenIntentDialog({ riverId, fixtures, onClose, onOpened }: OpenIntentDialogProps): ReactElement {
  const [title, setTitle] = useState("");
  const [goal, setGoal] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const id = useId();

  useEffect(() => {
    titleRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const req: OpenIntentRequest = { title: title.trim(), goal: goal.trim() };
    if (!req.title || !req.goal) return;
    if (fixtures) {
      setError("This River is showing sample data, so nothing was sent.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await openIntent(riverId, req);
      onOpened?.(res && typeof res === "object" && "id" in res ? res.id : null);
      onClose();
    } catch (err) {
      setError(`Couldn’t open the Intent: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const label = { fontSize: 11, fontWeight: 600, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--hw-color-ink-3)" } as const;

  return (
    <div
      role="presentation"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: "color-mix(in srgb, var(--hw-color-ink) 22%, transparent)",
        animation: "hw-fade-in var(--hw-motion-base) var(--hw-motion-ease-out)",
      }}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-h`}
        onSubmit={submit}
        style={{
          width: "100%",
          maxWidth: 480,
          background: "var(--hw-color-surface)",
          border: "1px solid var(--hw-color-line)",
          borderRadius: "var(--hw-radius-lg)",
          boxShadow: "var(--hw-shadow-lg)",
          padding: "24px 28px",
          display: "flex",
          flexDirection: "column",
          gap: 18,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <h2 id={`${id}-h`} style={{ margin: 0, fontFamily: "var(--hw-font-display)", fontWeight: 500, fontSize: 22, letterSpacing: "-0.01em" }}>
            Open an Intent
          </h2>
          <p style={{ margin: 0, color: "var(--hw-color-ink-3)", fontSize: 13.5 }}>One sentence about what should change. Several agents fork the River and start at once.</p>
        </div>
        <label style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={label}>Title</span>
          <input ref={titleRef} className="hw-field" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a dark mode" maxLength={120} required />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={label}>Goal</span>
          <textarea
            className="hw-field"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="The dashboard follows the system theme and keeps its contrast in both modes."
            rows={3}
            maxLength={2000}
            required
            style={{ resize: "vertical", minHeight: 76 }}
          />
        </label>
        {error ? <p style={{ margin: 0, fontSize: 13, color: "var(--hw-color-conflict)" }}>{error}</p> : null}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" className={buttonClass("tertiary")} style={buttonStyle("tertiary", "12px 18px", "0.14em")} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={buttonClass("primary")} style={buttonStyle("primary", "12px 18px", "0.14em")} disabled={busy || !title.trim() || !goal.trim()} aria-busy={busy}>
            Open an Intent
          </button>
        </div>
      </form>
    </div>
  );
}
