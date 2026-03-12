import React from "react";
import ReactDOM from "react-dom/client";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";

import App from "./App";
import "./i18n";
import "./styles/index.css";
import { LocaleProvider } from "@/components/locale-provider";

const convexUrl = import.meta.env.VITE_CONVEX_URL;
const convex = new ConvexReactClient(convexUrl);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConvexAuthProvider client={convex}>
      <LocaleProvider>
        <App />
      </LocaleProvider>
    </ConvexAuthProvider>
  </React.StrictMode>,
);
