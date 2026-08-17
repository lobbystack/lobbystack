type LobbyStackApi = {
  open: () => void;
  close: () => void;
  toggle: () => void;
  setVisitor: (visitor: Record<string, unknown>) => void;
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
.lobby-widget-badge{position:absolute;top:-4px;right:-4px;min-width:20px;height:20px;border-radius:9999px;background:#ef4444;color:#fff;font:600 12px/20px system-ui,sans-serif;text-align:center;padding:0 5px;display:none}
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
  const adminOrigin = resolveOrigin() || window.origin;
  const visitorId = makeVisitorId(widgetKey);
  const frameSrc = `${adminOrigin}/embed/${encodeURIComponent(widgetKey)}`;

  injectStyles();

  const root = document.createElement("div");
  root.className = "lobby-widget-root";
  const holder = document.createElement("div");
  holder.className = "lobby-widget-frame-holder";
  holder.setAttribute("data-position", position);
  const frame = document.createElement("iframe");
  frame.className = "lobby-widget-frame";
  frame.setAttribute("src", frameSrc);
  frame.setAttribute("title", "Chat with us");
  frame.setAttribute("allow", "microphone");
  frame.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms");
  frame.setAttribute("loading", "lazy");
  const bubble = document.createElement("button");
  bubble.type = "button";
  bubble.className = "lobby-widget-bubble";
  bubble.setAttribute("aria-label", "Open chat");
  bubble.setAttribute("data-position", position);
  bubble.style.backgroundColor = color;
  bubble.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>`;
  const badge = document.createElement("span");
  badge.className = "lobby-widget-badge";
  const closeSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;

  holder.appendChild(frame);
  root.appendChild(holder);
  document.body.appendChild(root);
  document.body.appendChild(bubble);
  bubble.appendChild(badge);

  let open = false;
  let badgeCount = 0;

  function syncBadge(): void {
    badge.textContent = String(badgeCount);
    badge.style.display = badgeCount > 0 && !open ? "block" : "none";
  }

  function syncBubbleIcon(): void {
    bubble.innerHTML = open ? closeSvg : `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>`;
    bubble.appendChild(badge);
  }

  function setOpen(next: boolean): void {
    open = next;
    holder.classList.toggle("lobby-widget-open", open);
    if (open && !holder.style.height) holder.style.height = "min(640px, calc(100vh - 120px))";
    bubble.setAttribute("aria-expanded", String(open));
    bubble.setAttribute("aria-label", open ? "Close chat" : "Open chat");
    syncBubbleIcon();
    syncBadge();
    postToFrame({ type: open ? "open" : "close" });
  }

  function postToFrame(message: WidgetMessage): void {
    try {
      frame.contentWindow?.postMessage(message, adminOrigin);
    } catch {
      /* ignore */
    }
  }

  frame.addEventListener("load", () => postToFrame({ type: "visitor", visitorId }));

  bubble.addEventListener("click", () => setOpen(!open));
  window.addEventListener("message", (event: MessageEvent) => {
    if (event.origin !== adminOrigin) return;
    const data = event.data as Partial<WidgetMessage>;
    if (!data || typeof data !== "object") return;
    if (data.type === "resize" && typeof data.height === "number" && open) {
      holder.style.height = `${Math.max(0, Math.min(data.height, Math.floor(window.innerHeight - 120)))}px`;
    }
    if (data.type === "unread" && typeof data.count === "number") {
      badgeCount = data.count;
      syncBadge();
    }
    if (data.type === "close") setOpen(false);
  });

  window.LobbyStack = {
    open: () => setOpen(true),
    close: () => setOpen(false),
    toggle: () => setOpen(!open),
    setVisitor: (visitor) => postToFrame({ type: "visitor", visitorId, ...visitor }),
  };

  return true;
}

declare global {
  interface Window {
    LobbyStack?: LobbyStackApi;
  }
}

initWidget();
