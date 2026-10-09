import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import {StartupSplash} from "./components/StartupSplash";
import { BackendProvider } from "./services/backend";
import { VisualAppearanceProvider } from "./components/VisualAppearance";
import "./components/Materials.css";
import "./ThemeTokens.css";
import "./ControlSystem.css";
import "./components/UnifiedSurfaces.css";
import "./components/Catalog.css";
import "./components/HomeContinue.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <BackendProvider><VisualAppearanceProvider><StartupSplash><App /></StartupSplash></VisualAppearanceProvider></BackendProvider>
  </React.StrictMode>,
);
