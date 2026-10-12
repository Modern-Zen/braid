import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../styles/base.css";
import { Landing } from "./Landing.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Landing />
  </StrictMode>,
);
