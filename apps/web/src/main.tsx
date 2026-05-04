import React from "react";
import ReactDOM from "react-dom/client";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";

import App from "./App";
import "./i18n";
import "./styles/index.css";
import { AppearanceProvider } from "@/components/appearance-provider";
import { LocaleProvider } from "@/components/locale-provider";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { initializeAnalytics } from "@/lib/analytics";
import {
  AppErrorBoundary,
  onCaughtReactError,
  onRecoverableReactError,
  onUncaughtReactError,
} from "@/lib/react-error-reporting";

const convexUrl = import.meta.env.CONVEX_URL;
const convex = new ConvexReactClient(convexUrl);

initializeAnalytics();

ReactDOM.createRoot(document.getElementById("root")!, {
  onCaughtError: onCaughtReactError,
  onRecoverableError: onRecoverableReactError,
  onUncaughtError: onUncaughtReactError,
}).render(
  <React.StrictMode>
    <ConvexAuthProvider client={convex}>
      <ThemeProvider>
        <AppearanceProvider>
          <LocaleProvider>
            <AppErrorBoundary>
              <App />
              <Toaster richColors />
            </AppErrorBoundary>
          </LocaleProvider>
        </AppearanceProvider>
      </ThemeProvider>
    </ConvexAuthProvider>
  </React.StrictMode>,
);
