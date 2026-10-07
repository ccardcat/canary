import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { BackendProvider } from "./services/backend";
import { VisualAppearanceProvider } from "./components/VisualAppearance";
import "./components/Materials.css";
import "./ThemeTokens.css";
import "./ControlSystem.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <BackendProvider><VisualAppearanceProvider><App /></VisualAppearanceProvider></BackendProvider>
  </React.StrictMode>,
);
