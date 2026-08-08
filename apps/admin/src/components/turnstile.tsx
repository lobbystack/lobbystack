"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

type TurnstileWidgetOptions = {
  sitekey: string;
  callback: (token: string) => void;
  "expired-callback": () => void;
  "timeout-callback": () => void;
  "error-callback": (errorCode?: string) => boolean;
  "before-interactive-callback"?: () => void;
  "after-interactive-callback"?: () => void;
  appearance?: "always" | "execute" | "interaction-only";
  execution?: "render" | "execute";
  "response-field"?: boolean;
  size?: "normal" | "flexible" | "compact";
  tabindex?: number;
  theme?: "auto" | "light" | "dark";
};

type TurnstileApi = {
  ready: (callback: () => void) => void;
  render: (container: HTMLElement, options: TurnstileWidgetOptions) => string;
  execute: (container: HTMLElement | string) => void;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
    __lobbystackTurnstileLoaded?: () => void;
  }
}

const TURNSTILE_SCRIPT_ID = "lobbystack-turnstile-script";
const TURNSTILE_SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?onload=__lobbystackTurnstileLoaded&render=explicit";

let scriptPromise: Promise<void> | null = null;

function waitForTurnstileApi(): Promise<void> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();

    function check() {
      if (window.turnstile) {
        resolve();
        return;
      }

      if (Date.now() - startedAt > 10000) {
        reject(new Error("Turnstile API did not initialize"));
        return;
      }

      window.setTimeout(check, 50);
    }

    check();
  });
}

function loadTurnstileScript(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.resolve();
  }

  if (window.turnstile) {
    return Promise.resolve();
  }

  if (scriptPromise) {
    return scriptPromise;
  }

  scriptPromise = new Promise((resolve, reject) => {
    document.getElementById(TURNSTILE_SCRIPT_ID)?.remove();

    const script = document.createElement("script");
    script.id = TURNSTILE_SCRIPT_ID;
    script.src = TURNSTILE_SCRIPT_SRC;
    script.async = false;
    window.__lobbystackTurnstileLoaded = () => {
      waitForTurnstileApi().then(resolve).catch((error) => {
        scriptPromise = null;
        reject(error);
      });
    };
    script.onerror = () => {
      scriptPromise = null;
      if (document.head.contains(script)) {
        script.remove();
      }
      reject(new Error("Turnstile script failed to load"));
    };
    script.onload = () => {
      waitForTurnstileApi().then(resolve).catch((error) => {
        scriptPromise = null;
        reject(error);
      });
    };
    document.head.appendChild(script);
  });

  return scriptPromise;
}

type TurnstileProps = {
  siteKey: string;
  onTokenChange: (token: string | null) => void;
  onError?: (errorCode?: string) => void;
};

export type TurnstileHandle = {
  execute: () => boolean;
};

export const Turnstile = forwardRef<TurnstileHandle, TurnstileProps>(function Turnstile(
  { siteKey, onTokenChange, onError },
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const executeWhenReadyRef = useRef(false);
  const executeTimerRef = useRef<number | null>(null);
  const onTokenChangeRef = useRef(onTokenChange);
  const onErrorRef = useRef(onError);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  onTokenChangeRef.current = onTokenChange;
  onErrorRef.current = onError;

  function handleLoadError(error?: unknown): void {
    onTokenChangeRef.current(null);
    setErrorCode(error instanceof Error ? error.message : "script-load-failed");
    onErrorRef.current?.();
  }

  function renderWidget(): boolean {
    if (widgetIdRef.current) {
      return true;
    }

    if (!containerRef.current || !window.turnstile) {
      return false;
    }

    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      appearance: "always",
      execution: "render",
      "response-field": false,
      size: "flexible",
      tabindex: 0,
      theme: "auto",
      callback: (token) => {
        onTokenChangeRef.current(token);
      },
      "expired-callback": () => {
        onTokenChangeRef.current(null);
      },
      "timeout-callback": () => {
        onTokenChangeRef.current(null);
      },
      "error-callback": (errorCode) => {
        console.warn("Turnstile challenge failed to render.", { errorCode });
        onTokenChangeRef.current(null);
        setErrorCode(errorCode ?? "unknown");
        onErrorRef.current?.(errorCode);
        return true;
      },
    });

    return true;
  }

  function executeRenderedWidget(): boolean {
    const container = containerRef.current;
    const turnstile = window.turnstile;
    if (!container || !turnstile) {
      handleLoadError();
      return false;
    }

    if (executeTimerRef.current !== null) {
      window.clearTimeout(executeTimerRef.current);
    }

    // Let React commit the reset state before Cloudflare executes the widget.
    executeTimerRef.current = window.setTimeout(() => {
      executeTimerRef.current = null;
      turnstile.execute(container);
    }, 0);
    return true;
  }

  function executeChallenge(): boolean {
    setErrorCode(null);

    if (!renderWidget()) {
      executeWhenReadyRef.current = true;
      void loadTurnstileScript()
        .then(() => {
          if (!window.turnstile) {
            handleLoadError();
            return;
          }

          window.turnstile.ready(() => {
            if (!renderWidget()) {
              handleLoadError();
              return;
            }

            if (executeWhenReadyRef.current) {
              executeWhenReadyRef.current = false;
              executeRenderedWidget();
            }
          });
        })
        .catch(handleLoadError);
      return true;
    }

    return executeRenderedWidget();
  }

  useImperativeHandle(ref, () => ({
    execute: executeChallenge,
  }));

  useEffect(() => {
    let isMounted = true;

    setErrorCode(null);
    onTokenChangeRef.current(null);

    loadTurnstileScript()
      .then(() => {
        if (!isMounted || !containerRef.current || !window.turnstile) {
          return;
        }

        window.turnstile.ready(() => {
          if (!isMounted || !containerRef.current || !window.turnstile) {
            return;
          }

          renderWidget();
          if (executeWhenReadyRef.current) {
            executeWhenReadyRef.current = false;
            executeChallenge();
          }
        });
      })
      .catch((error: unknown) => {
        if (isMounted) {
          handleLoadError(error);
        }
      });

    return () => {
      isMounted = false;
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
      }
      if (executeTimerRef.current !== null) {
        window.clearTimeout(executeTimerRef.current);
      }
      widgetIdRef.current = null;
      executeTimerRef.current = null;
    };
  }, [siteKey]);

  return (
    <div className="flex min-h-[80px] w-full flex-col items-start justify-center gap-2">
      <div className="min-h-[80px] w-full" ref={containerRef} />
    </div>
  );
});
