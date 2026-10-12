import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../styles/base.css";
import { AppShell } from "./AppShell.tsx";
import { SessionGate } from "./SessionGate.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SessionGate>{(session) => <AppShell key={session} />}</SessionGate>
  </StrictMode>,
);
