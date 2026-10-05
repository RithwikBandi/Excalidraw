import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

// must run before any editor module is evaluated (it configures where the editor loads fonts from)
import "./assetPath";

import { App } from "./App";
import { installGlobalErrorReporting } from "./api/telemetry";
import { AuthProvider } from "./auth/AuthProvider";
import { ConfirmProvider } from "./ui/ConfirmProvider";
import { ToastProvider } from "./ui/Toast";

import "./styles.css";
import "./ui/ui.css";

installGlobalErrorReporting();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <ConfirmProvider>
            <App />
          </ConfirmProvider>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
