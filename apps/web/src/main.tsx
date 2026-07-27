import React from "react";
import ReactDOM from "react-dom/client";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";

import App from "./App";
import { i18nReady } from "./i18n";
import "./styles/index.css";
import { AppearanceProvider } from "@/components/appearance-provider";
import { LocaleProvider } from "@/components/locale-provider";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { initializeAnalytics } from "@/lib/analytics";
import { scrubCheckoutSessionTokenFromLocation } from "@/lib/checkout-session-token";
import { scrubProspectDemoTokenFromLocation } from "@/lib/prospect-demo-token";
import {
  AppErrorBoundary,
  onCaughtReactError,
  onRecoverableReactError,
  onUncaughtReactError,
} from "@/lib/react-error-reporting";

function MissingConvexConfig() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-6 text-foreground">
      <div className="flex max-w-md flex-col gap-4 text-center">
        <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Missing configuration
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">Convex URL is not configured</h1>
        <p className="text-sm leading-6 text-muted-foreground">
          Set <code className="font-mono text-foreground">CONVEX_URL</code> in the root environment, or
          run <code className="font-mono text-foreground">pnpm convex dev</code> to configure the local
          deployment before starting the web app.
        </p>
      </div>
    </main>
  );
}

const convexUrl = import.meta.env.CONVEX_URL ?? import.meta.env.VITE_CONVEX_URL;

scrubCheckoutSessionTokenFromLocation();
scrubProspectDemoTokenFromLocation();
initializeAnalytics();

const root = ReactDOM.createRoot(document.getElementById("root")!, {
  onCaughtError: onCaughtReactError,
  onRecoverableError: onRecoverableReactError,
  onUncaughtError: onUncaughtReactError,
});

function renderApp() {
  if (!convexUrl) {
    root.render(
      <React.StrictMode>
        <MissingConvexConfig />
      </React.StrictMode>,
    );
    return;
  }

  const convex = new ConvexReactClient(convexUrl);
  root.render(
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
}

void i18nReady.catch((error) => {
  console.error("Failed to initialize translations.", error);
}).finally(renderApp);
