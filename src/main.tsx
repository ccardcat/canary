import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { VisualAppearanceProvider } from "./components/VisualAppearance";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <VisualAppearanceProvider><App /></VisualAppearanceProvider>
  </React.StrictMode>,
);
