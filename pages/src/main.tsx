import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import PrototypeApp from "../../app/page";

const root = typeof document === "undefined" ? null : document.getElementById("root");

if (root) {
  createRoot(root).render(
    <StrictMode>
      <PrototypeApp />
    </StrictMode>,
  );
}
