type LobbyStackApi = {
  open: () => void;
  close: () => void;
  toggle: () => void;
};

type WidgetMessage = { type: string; [key: string]: unknown };

const WIDGET_STYLES = `
.lobby-widget-root{position:fixed;inset:0;pointer-events:none}
.lobby-widget-bubble{position:fixed;bottom:24px;right:24px;width:60px;height:60px;border-radius:9999px;border:0;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 8px 24px rgba(0,0,0,.22);pointer-events:auto;transition:transform .15s ease;z-index:2147483000}
.lobby-widget-bubble:hover{transform:scale(1.06)}
.lobby-widget-bubble[data-position="bottom-left"]{left:24px;right:auto}
.lobby-widget-bubble[data-position="bottom-center"]{left:50%;transform:translateX(-50%)}
.lobby-widget-bubble[data-position="bottom-center"]:hover{transform:translateX(-50%) scale(1.06)}
.lobby-widget-bubble svg{width:30px;height:30px}
.lobby-widget-frame-holder{position:fixed;bottom:96px;right:24px;width:min(380px,calc(100vw - 32px));height:0;opacity:0;pointer-events:none;transition:opacity .18s ease;z-index:2147483001}
.lobby-widget-frame-holder[data-position="bottom-left"]{left:24px;right:auto}
.lobby-widget-frame-holder[data-position="bottom-center"]{left:50%;transform:translateX(-50%)}
.lobby-widget-frame-holder.lobby-widget-open{opacity:1;pointer-events:auto}
.lobby-widget-frame{width:100%;height:100%;border:0;border-radius:16px;background:#fff;box-shadow:0 24px 64px rgba(0,0,0,.24)}
.lobby-widget-hidden{display:none!important}
`;

function injectStyles(): void {
  const style = document.createElement("style");
  style.textContent = WIDGET_STYLES;
  document.head.appendChild(style);
}

function resolveOrigin(): string {
  const baseUrl = currentScriptAttribute("data-base-url");
  if (baseUrl) {
    try {
      return new URL(baseUrl, window.location.href).origin;
    } catch {
      /* fall through */
    }
  }
  return window.origin;
}

function currentScriptAttribute(name: string): string | null {
  const script = document.currentScript as HTMLScriptElement | null;
  return script?.getAttribute(name) ?? null;
}

function makeVisitorId(widgetKey: string): string {
  const storageKey = `lobbystack.visitorId.${widgetKey}`;
  try {
    const existing = window.localStorage.getItem(storageKey);
    if (existing) return existing;
  } catch {
    /* storage unavailable */
  }
  const id = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `v-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  try {
    window.localStorage.setItem(storageKey, id);
  } catch {
    /* storage unavailable */
  }
  return id;
}

export function initWidget(): boolean {
  const widgetKey = (currentScriptAttribute("data-widget-key") ?? "").trim();
  if (!widgetKey) return false;
  const position = (currentScriptAttribute("data-position") as "bottom-left" | "bottom-center" | "bottom-right" | null) ?? "bottom-right";
  const color = currentScriptAttribute("data-color") ?? "#0f766e";
  const french = (currentScriptAttribute("data-locale") ?? document.documentElement.lang ?? "en").toLowerCase().startsWith("fr");
  const labels = french ? { title: "Discutez avec nous", open: "Ouvrir la discussion", close: "Fermer la discussion" } : { title: "Chat with us", open: "Open chat", close: "Close chat" };
  const adminOrigin = resolveOrigin() || window.origin;
  let visitorId = makeVisitorId(widgetKey);
  const frameSrc = `${adminOrigin}/embed/${encodeURIComponent(widgetKey)}`;

  injectStyles();

  const root = document.createElement("div");
  root.className = "lobby-widget-root";
  const holder = document.createElement("div");
  holder.className = "lobby-widget-frame-holder";
  holder.setAttribute("data-position", position);
  const frame = document.createElement("iframe");
  frame.className = "lobby-widget-frame";
  frame.setAttribute("title", labels.title);
  frame.setAttribute("allow", "microphone");
  frame.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox");
  frame.setAttribute("loading", "lazy");
  const bubble = document.createElement("button");
  bubble.type = "button";
  bubble.className = "lobby-widget-bubble";
  bubble.setAttribute("aria-label", labels.open);
  bubble.setAttribute("aria-expanded", "false");
  holder.inert = true;
  bubble.setAttribute("data-position", position);
  bubble.style.backgroundColor = color;
  bubble.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>`;
  const closeSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;

  holder.appendChild(frame);
  root.appendChild(holder);
  document.body.appendChild(root);
  document.body.appendChild(bubble);

  let open = false;
  let started = false;
  let frameLoaded = false;
  let sessionMessage: WidgetMessage | null = null;
  let sessionRefreshTimer: number | undefined;
  let sessionState: "idle" | "pending" | "ready" | "error" = "idle";

  async function refreshSession(nextVisitorId: string): Promise<void> {
    visitorId = nextVisitorId;
    sessionState = "pending";
    try {
      const response = await fetch(`${adminOrigin}/api/widget/session`, {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: JSON.stringify({ widgetKey, visitorId }),
      });
      const payload = await response.json() as { token?: string; expiresAt?: string; code?: string };
      if (!response.ok || !payload.token) {
        sessionState = "error";
        sessionMessage = { type: "session-error", code: payload.code ?? "widget_session_failed" };
        if (frameLoaded) postToFrame(sessionMessage);
        return;
      }
      sessionState = "ready";
      sessionMessage = { type: "session", token: payload.token, expiresAt: payload.expiresAt, visitorId, parentOrigin: window.location.origin };
      if (frameLoaded) postToFrame(sessionMessage);
      if (sessionRefreshTimer !== undefined) window.clearTimeout(sessionRefreshTimer);
      const expiresAtMs = payload.expiresAt ? Date.parse(payload.expiresAt) : Date.now() + 3_600_000;
      sessionRefreshTimer = window.setTimeout(() => void refreshSession(visitorId), Math.max(30_000, expiresAtMs - Date.now() - 60_000));
    } catch {
      sessionState = "error";
      sessionMessage = { type: "session-error", code: "widget_session_failed" };
      if (frameLoaded) postToFrame(sessionMessage);
    }
  }

  function syncBubbleIcon(): void {
    bubble.innerHTML = open ? closeSvg : `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>`;
  }

  function setOpen(next: boolean): void {
    open = next;
    holder.inert = !open;
    if (open && !started) {
      started = true;
      frame.setAttribute("src", frameSrc);
    }
    if (open && (sessionState === "idle" || sessionState === "error")) {
      void refreshSession(visitorId);
    }
    holder.classList.toggle("lobby-widget-open", open);
    if (open && !holder.style.height) holder.style.height = "min(640px, calc(100vh - 120px))";
    bubble.setAttribute("aria-expanded", String(open));
    bubble.setAttribute("aria-label", open ? labels.close : labels.open);
    syncBubbleIcon();
    postToFrame({ type: open ? "open" : "close" });
  }

  function postToFrame(message: WidgetMessage): void {
    try {
      frame.contentWindow?.postMessage(message, adminOrigin);
    } catch {
      /* ignore */
    }
  }

  frame.addEventListener("load", () => {
    frameLoaded = true;
    if (sessionMessage) postToFrame(sessionMessage);
    postToFrame({ type: "visitor", visitorId });
  });

  // Issue the session on first open instead of at script load. This keeps the
  // widget dormant (and avoids an unauthenticated request) until a visitor
  // engages, while a failed request can retry on a later open.
  bubble.addEventListener("click", () => setOpen(!open));
  window.addEventListener("message", (event: MessageEvent) => {
    if (event.origin !== adminOrigin || event.source !== frame.contentWindow) return;
    const data = event.data as Partial<WidgetMessage>;
    if (!data || typeof data !== "object") return;
    if (data.type === "ready") {
      frameLoaded = true;
      if (sessionMessage) postToFrame(sessionMessage);
      postToFrame({ type: "visitor", visitorId });
    }
    if (data.type === "resize" && typeof data.height === "number" && Number.isFinite(data.height) && open) {
      holder.style.height = `${Math.max(0, Math.min(data.height, Math.floor(window.innerHeight - 120)))}px`;
    }
    if (data.type === "close") setOpen(false);
  });

  window.LobbyStack = {
    open: () => setOpen(true),
    close: () => setOpen(false),
    toggle: () => setOpen(!open),
  };

  return true;
}

declare global {
  interface Window {
    LobbyStack?: LobbyStackApi;
  }
}

initWidget();
