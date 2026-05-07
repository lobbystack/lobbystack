"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

type TurnstileWidgetOptions = {
  sitekey: string;
  callback: (token: string) => void;
  "expired-callback": () => void;
  "timeout-callback": () => void;
  "error-callback": (errorCode?: string) => boolean;
  appearance?: "always" | "execute" | "interaction-only";
  execution?: "render" | "execute";
  size?: "normal" | "flexible" | "compact";
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
  const onTokenChangeRef = useRef(onTokenChange);
  const onErrorRef = useRef(onError);
  const [isActive, setIsActive] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  onTokenChangeRef.current = onTokenChange;
  onErrorRef.current = onError;

  function executeChallenge(): boolean {
    setIsActive(true);
    setErrorCode(null);

    if (!containerRef.current || !window.turnstile) {
      executeWhenReadyRef.current = true;
      return true;
    }

    window.turnstile.execute(containerRef.current);
    return true;
  }

  useImperativeHandle(ref, () => ({
    execute: executeChallenge,
  }));

  useEffect(() => {
    let isMounted = true;

    setIsActive(true);
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

          widgetIdRef.current = window.turnstile.render(containerRef.current, {
            sitekey: siteKey,
            appearance: "interaction-only",
            execution: "execute",
            size: "flexible",
            theme: "light",
            callback: (token) => {
              setIsActive(false);
              onTokenChangeRef.current(token);
            },
            "expired-callback": () => {
              setIsActive(false);
              onTokenChangeRef.current(null);
            },
            "timeout-callback": () => {
              setIsActive(true);
              onTokenChangeRef.current(null);
            },
            "error-callback": (errorCode) => {
              console.warn("Turnstile challenge failed to render.", { errorCode });
              onTokenChangeRef.current(null);
              setIsActive(false);
              setErrorCode(errorCode ?? "unknown");
              onErrorRef.current?.(errorCode);
              return true;
            },
          });
          if (executeWhenReadyRef.current) {
            executeWhenReadyRef.current = false;
            executeChallenge();
          }
        });
      })
      .catch((error: unknown) => {
        if (isMounted) {
          onTokenChangeRef.current(null);
          setIsActive(false);
          setErrorCode(error instanceof Error ? error.message : "script-load-failed");
          onErrorRef.current?.();
        }
      });

    return () => {
      isMounted = false;
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
      }
      widgetIdRef.current = null;
    };
  }, [siteKey]);

  const shouldReserveSpace = isActive || Boolean(errorCode);

  return (
    <div
      className={
        shouldReserveSpace
          ? "flex min-h-[65px] w-full flex-col items-start justify-center gap-2"
          : "h-0 w-full overflow-hidden"
      }
    >
      <div className="h-[65px] w-full min-w-[300px]" ref={containerRef} />
      {errorCode && import.meta.env.DEV ? (
        <p className="text-sm text-destructive">Turnstile error: {errorCode}</p>
      ) : null}
    </div>
  );
});
