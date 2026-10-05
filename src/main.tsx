import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { BackendProvider } from "./services/backend";
import { VisualAppearanceProvider } from "./components/VisualAppearance";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <VisualAppearanceProvider><BackendProvider><App /></BackendProvider></VisualAppearanceProvider>
  </React.StrictMode>,
);
