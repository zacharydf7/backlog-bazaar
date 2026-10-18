import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Bundled typefaces (no network fetch): Zilla Slab is the display slab for
// headings and titles; IBM Plex Mono sets every number, price, and label that
// should read like a ledger entry. Weights are imported individually to keep
// the payload small.
import "@fontsource/zilla-slab/500.css";
import "@fontsource/zilla-slab/600.css";
import "@fontsource/zilla-slab/700.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
import "./index.css";
import App from "./App";
import { installNumberInputWheelGuard } from "./lib/wheelGuard";
import { syncThemeColor } from "./lib/theme";

// Keep the scroll wheel from silently spinning focused number inputs
// (copy costs, admin adjustments) while scrolling the page.
installNumberInputWheelGuard();

// The theme set before paint (index.html) now has its colors loaded.
syncThemeColor();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
