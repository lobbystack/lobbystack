type LobbyStackApi = {
  open: () => void;
  close: () => void;
  toggle: () => void;
};

type WidgetMessage = { type: string; [key: string]: unknown };

const EASE_OUT = "cubic-bezier(.23,1,.32,1)";
// Phones get the chat as a full-screen sheet; the loader tells the chat so it can draw its own close button.
const SHEET_QUERY = "(max-width: 480px)";
// The root's z-index lifts the panel above the site's own fixed elements: a
// fixed element is a stacking context, so the panel's z-index alone only counts
// inside it. The bubble has the same z-index and comes later in the page, so it
// stays above the panel's shadow.
const WIDGET_STYLES = `
.lobby-widget-root{position:fixed;inset:0;pointer-events:none;z-index:2147483000}
.lobby-widget-bubble{position:fixed;bottom:24px;right:24px;width:56px;height:56px;padding:0;border-radius:9999px;border:0;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 2px rgba(24,24,27,.12),0 8px 24px rgba(24,24,27,.18);pointer-events:auto;outline:none;-webkit-tap-highlight-color:transparent;transition:transform .16s ease-out,opacity .16s ease-out;z-index:2147483000}
.lobby-widget-bubble:focus-visible{box-shadow:0 0 0 2px #fff,0 0 0 4px #18181b,0 8px 24px rgba(24,24,27,.18)}
.lobby-widget-bubble:active{transform:scale(.95)}
@media (hover:hover) and (pointer:fine){.lobby-widget-bubble:hover{transform:scale(1.05)}.lobby-widget-bubble:hover:active{transform:scale(.95)}}
.lobby-widget-bubble[data-position="bottom-left"]{left:24px;right:auto}
.lobby-widget-bubble svg{position:absolute;width:26px;height:26px;transition:transform .2s ${EASE_OUT},opacity .2s ${EASE_OUT}}
.lobby-widget-bubble .lobby-widget-icon-close{opacity:0;transform:rotate(-90deg) scale(.6)}
.lobby-widget-bubble[aria-expanded="true"] .lobby-widget-icon-chat{opacity:0;transform:rotate(90deg) scale(.6)}
.lobby-widget-bubble[aria-expanded="true"] .lobby-widget-icon-close{opacity:1;transform:none}
.lobby-widget-frame-holder{position:fixed;bottom:92px;right:24px;width:min(380px,calc(100vw - 32px));height:min(640px,calc(100vh - 116px));opacity:0;transform:translateY(12px) scale(.96);transform-origin:bottom right;pointer-events:none;transition:opacity .15s ease-out,transform .15s ease-out;z-index:2147483001}
.lobby-widget-frame-holder[data-position="bottom-left"]{left:24px;right:auto;transform-origin:bottom left}
.lobby-widget-frame-holder.lobby-widget-open{opacity:1;transform:none;pointer-events:auto;transition-duration:.24s;transition-timing-function:${EASE_OUT}}
.lobby-widget-frame{display:block;width:100%;height:100%;border:0;border-radius:16px;background:#fff;color-scheme:light;box-shadow:0 0 0 1px rgba(24,24,27,.08),0 4px 8px rgba(24,24,27,.04),0 16px 48px rgba(24,24,27,.18)}
@media ${SHEET_QUERY}{
.lobby-widget-frame-holder,.lobby-widget-frame-holder[data-position]{inset:0;width:100%;height:100%;translate:none;transform:translateY(24px);transform-origin:bottom center}
.lobby-widget-frame-holder.lobby-widget-open{transform:none}
.lobby-widget-frame{border-radius:0;box-shadow:none}
.lobby-widget-bubble[aria-expanded="true"]{opacity:0;pointer-events:none;transform:scale(.8)}
}
@media (prefers-reduced-motion:reduce){.lobby-widget-frame-holder,.lobby-widget-frame-holder[data-position]{transform:none}.lobby-widget-bubble,.lobby-widget-bubble svg{transition:opacity .15s ease}}
.lobby-widget-hidden{display:none!important}
`;

function injectStyles(): void {
  const style = document.createElement("style");
  style.textContent = WIDGET_STYLES;
  document.head.appendChild(style);
}

function resolveOrigin(): string {
  // The admin app serves this loader, so its own src names the API origin when data-base-url is absent.
  const baseUrl = currentScriptAttribute("data-base-url") || (document.currentScript as HTMLScriptElement | null)?.src;
  if (baseUrl) {
    try {
      return new URL(baseUrl, window.location.href).origin;
    } catch {
      /* fall through */
    }
  }
  return window.origin;
}

type LoaderLabels = { title: string; open: string; close: string };

const LOADER_LABELS: Record<"en" | "fr" | "es" | "sr", LoaderLabels> = {
  en: { title: "Chat with us", open: "Open chat", close: "Close chat" },
  fr: { title: "Discutez avec nous", open: "Ouvrir la discussion", close: "Fermer la discussion" },
  es: { title: "Escríbanos", open: "Abrir el chat", close: "Cerrar el chat" },
  sr: { title: "Pišite nam", open: "Otvori čet", close: "Zatvori čet" },
};

/** Labels for the bubble and frame in the host page's language, English otherwise. */
export function loaderLabels(language: string): LoaderLabels {
  const primary = language.trim().toLowerCase().split(/[-_]/)[0];
  return primary === "fr" || primary === "es" || primary === "sr" ? LOADER_LABELS[primary] : LOADER_LABELS.en;
}

/** The key in the loader's own URL (`/embed.js?key=…`), for a tag without data-widget-key. */
function scriptSrcKey(): string | null {
  const src = (document.currentScript as HTMLScriptElement | null)?.src;
  if (!src) return null;
  try {
    return new URL(src, window.location.href).searchParams.get("key");
  } catch {
    return null;
  }
}

function currentScriptAttribute(name: string): string | null {
  const script = document.currentScript as HTMLScriptElement | null;
  return script?.getAttribute(name) ?? null;
}

type WidgetPosition = "bottom-left" | "bottom-right";
type WidgetLocale = "en" | "fr" | "es" | "sr";
type WidgetAppearance = { color?: string; position?: WidgetPosition; locale?: WidgetLocale };

// Filled by the dashboard's keyed loader (`/embed.js?key=…`) before this code
// runs; the name matches WIDGET_APPEARANCE_GLOBAL in @lobbystack/shared.
const APPEARANCE_GLOBAL = "__lobbyStackWidgetAppearance";
const POSITIONS: ReadonlyArray<WidgetPosition> = ["bottom-left", "bottom-right"];
const LOCALES: ReadonlyArray<WidgetLocale> = ["en", "fr", "es", "sr"];
// Matches WIDGET_COLOR_PATTERN in @lobbystack/shared, which this bundle doesn't import.
const COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/** Near-black or white, whichever reads better on the bubble color. Matches readableOn in the admin widget. */
export function readableOn(hex: string): string {
  let value = hex.replace("#", "");
  if (value.length <= 4) value = [...value].map((digit) => digit + digit).join("");
  const [red, green, blue] = [0, 2, 4].map((start) => {
    const channel = Number.parseInt(value.slice(start, start + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * red! + 0.7152 * green! + 0.0722 * blue!;
  return (luminance + 0.05) / 0.0597 > 1.05 / (luminance + 0.05) ? "#18181b" : "#ffffff";
}

/** The bubble look and chat language the dashboard saved for this key, when the loader carried them. */
function savedAppearance(widgetKey: string): WidgetAppearance {
  const saved = (window as unknown as Record<string, Record<string, WidgetAppearance> | undefined>)[APPEARANCE_GLOBAL]?.[widgetKey];
  return {
    ...(typeof saved?.color === "string" && COLOR_PATTERN.test(saved.color) ? { color: saved.color } : {}),
    ...(saved?.position && POSITIONS.includes(saved.position) ? { position: saved.position } : {}),
    ...(saved?.locale && LOCALES.includes(saved.locale) ? { locale: saved.locale } : {}),
  };
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// crypto.randomUUID only exists on https pages; getRandomValues also works on http ones.
function randomUuid(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function makeVisitorId(widgetKey: string): string {
  const storageKey = `lobbystack.visitorId.${widgetKey}`;
  try {
    // Older loaders stored non-UUID ids on http pages, which the session API rejects.
    const existing = window.localStorage.getItem(storageKey);
    if (existing && UUID_PATTERN.test(existing)) return existing;
  } catch {
    /* storage unavailable */
  }
  const id = randomUuid();
  try {
    window.localStorage.setItem(storageKey, id);
  } catch {
    /* storage unavailable */
  }
  return id;
}

export function initWidget(): boolean {
  const widgetKey = (currentScriptAttribute("data-widget-key") ?? scriptSrcKey() ?? "").trim();
  if (!widgetKey) return false;
  // The dashboard's saved look wins; the script tag's attributes cover older snippets.
  const saved = savedAppearance(widgetKey);
  // An older snippet may still ask for the retired center spot, or something unknown; those open bottom right.
  const tagPosition = currentScriptAttribute("data-position") as WidgetPosition | null;
  const position = saved.position ?? (tagPosition && POSITIONS.includes(tagPosition) ? tagPosition : "bottom-right");
  const color = saved.color ?? currentScriptAttribute("data-color") ?? "#18181b";
  const labels = loaderLabels(currentScriptAttribute("data-locale") ?? document.documentElement.lang ?? "en");
  const adminOrigin = resolveOrigin();
  let visitorId = makeVisitorId(widgetKey);
  // The chat page draws itself in the bubble's color and the business's language from its first
  // paint, instead of defaults that its settings then replace.
  const frameSrc = `${adminOrigin}/embed/${encodeURIComponent(widgetKey)}?${new URLSearchParams({ color, ...(saved.locale ? { locale: saved.locale } : {}) })}`;

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
  bubble.style.color = readableOn(color);
  // Lucide's message-circle and chevron-down. Both stay in the bubble and cross-fade on open and close.
  const icon = (name: string, paths: string) => `<svg class="lobby-widget-icon-${name}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
  bubble.innerHTML = icon("chat", `<path d="M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719"></path>`) + icon("close", `<path d="m6 9 6 6 6-6"></path>`);

  holder.appendChild(frame);
  root.appendChild(holder);
  // A snippet in the page's <head> without defer runs before <body> exists, so
  // the widget joins the page once it has been read.
  const attach = () => (document.body ?? document.documentElement).append(root, bubble);
  if (document.body) attach();
  else document.addEventListener("DOMContentLoaded", attach, { once: true });

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
    // The panel keeps one height whatever the chat holds, so new messages never move the page.
    holder.classList.toggle("lobby-widget-open", open);
    bubble.setAttribute("aria-expanded", String(open));
    bubble.setAttribute("aria-label", open ? labels.close : labels.open);
    postToFrame({ type: open ? "open" : "close" });
    // The sheet covers the bubble on a phone, so focus goes back to it on close.
    if (!open && holder.contains(document.activeElement)) bubble.focus();
  }

  function postToFrame(message: WidgetMessage): void {
    try {
      frame.contentWindow?.postMessage(message, adminOrigin);
    } catch {
      /* ignore */
    }
  }

  const sheetQuery = typeof window.matchMedia === "function" ? window.matchMedia(SHEET_QUERY) : null;
  const postLayout = () => postToFrame({ type: "layout", sheet: sheetQuery?.matches === true });
  sheetQuery?.addEventListener?.("change", postLayout);

  function onFrameReady(): void {
    frameLoaded = true;
    if (sessionMessage) postToFrame(sessionMessage);
    postToFrame({ type: "visitor", visitorId });
    postLayout();
  }

  frame.addEventListener("load", onFrameReady);

  // Leaving or reloading the page hangs up a voice call in the chat, and its
  // captions aren't saved, so while the chat says it has one the browser asks
  // first. Browsers word the prompt themselves. The listener only exists while
  // it's needed, since a standing beforeunload listener can keep the page out
  // of the browser's back/forward cache.
  let warnOnLeave = false;
  const confirmLeave = (event: BeforeUnloadEvent) => {
    event.preventDefault();
    // Chrome and Edge before 119 ignore preventDefault and need returnValue.
    event.returnValue = true;
  };
  function setWarnOnLeave(next: boolean): void {
    if (next === warnOnLeave) return;
    warnOnLeave = next;
    if (next) window.addEventListener("beforeunload", confirmLeave);
    else window.removeEventListener("beforeunload", confirmLeave);
  }

  // Issue the session on first open instead of at script load. This keeps the
  // widget dormant (and avoids an unauthenticated request) until a visitor
  // engages, while a failed request can retry on a later open.
  bubble.addEventListener("click", () => setOpen(!open));
  window.addEventListener("message", (event: MessageEvent) => {
    if (event.origin !== adminOrigin || event.source !== frame.contentWindow) return;
    const data = event.data as Partial<WidgetMessage>;
    if (!data || typeof data !== "object") return;
    if (data.type === "ready") onFrameReady();
    if (data.type === "close") setOpen(false);
    if (data.type === "leave-warning") setWarnOnLeave(data.enabled === true);
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
