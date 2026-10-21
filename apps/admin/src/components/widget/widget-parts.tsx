"use client";

import type { ReactNode } from "react";
import { ArrowUp, ChevronDown, LoaderCircle, MessageCircle } from "lucide-react";

import { cn } from "@/lib/utils";

// The widget is drawn light everywhere it appears, on a visitor's site and in the
// dashboard preview, so these pieces use fixed zinc colors instead of theme tokens.

/** Near-black or white, whichever reads better on the widget color (a yellow gets dark text). */
export function readableOn(hex: string): string {
  let value = hex.replace("#", "");
  if (value.length <= 4) value = [...value].map((digit) => digit + digit).join("");
  const [red, green, blue] = [0, 2, 4].map((start) => {
    const channel = Number.parseInt(value.slice(start, start + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * red! + 0.7152 * green! + 0.0722 * blue!;
  // Contrast ratios against white and against zinc-900 (luminance 0.0097).
  return (luminance + 0.05) / 0.0597 > 1.05 / (luminance + 0.05) ? "#18181b" : "#ffffff";
}

type Accent = { color: string; onColor: string };

export function WidgetHeader({ color, onColor, title, subtitle, pending, actions }: Accent & { title: string; subtitle?: string | undefined; pending?: boolean; actions?: ReactNode }) {
  return (
    <header className="flex min-h-16 shrink-0 items-center gap-3 border-b border-zinc-100 px-4 py-3">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-full text-[15px] font-semibold" style={{ backgroundColor: color, color: onColor }} aria-hidden="true">
        {pending ? null : (title || "?")[0]?.toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        {pending ? <div className="my-0.5 h-4 w-32 animate-pulse rounded-full bg-zinc-100" aria-hidden="true" /> : <p className="truncate text-[15px] leading-5 font-medium text-zinc-900">{title}</p>}
        {!pending && subtitle ? <p className="truncate text-[13px] leading-[18px] text-zinc-500">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
    </header>
  );
}

/** A message in the thread: the receptionist's or the team's on gray, the visitor's in the widget color. */
export function WidgetBubble({ from, color, onColor, className, children }: Accent & { from: "assistant" | "visitor"; className?: string; children: ReactNode }) {
  return (
    <div
      className={cn("max-w-[85%] rounded-[18px] px-3.5 py-2 text-sm leading-5 wrap-anywhere", from === "visitor" ? "rounded-br-md" : "rounded-bl-md bg-zinc-100 text-zinc-900", className)}
      style={from === "visitor" ? { backgroundColor: color, color: onColor } : undefined}
    >
      {children}
    </div>
  );
}

/** The receptionist is writing: three dots in an assistant bubble. */
export function WidgetTyping({ label }: { label: string }) {
  return (
    <div className="flex justify-start" role="status">
      <span className="sr-only">{label}</span>
      <div className="flex h-9 items-center gap-1 rounded-[18px] rounded-bl-md bg-zinc-100 px-3.5" aria-hidden="true">
        {[0, 200, 400].map((delay) => <span key={delay} className="size-1.5 rounded-full bg-zinc-400 motion-safe:animate-pulse" style={{ animationDelay: `${delay}ms` }} />)}
      </div>
    </div>
  );
}

/** The message box with its send button inside, which takes the widget color once there is something to send. */
export function WidgetComposerField({ color, onColor, value, onChange, placeholder, sendLabel, disabled, canSend, sending }: Accent & { value: string; onChange?: (value: string) => void; placeholder: string; sendLabel: string; disabled?: boolean; canSend: boolean; sending?: boolean }) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-zinc-200 bg-white py-1 pr-1 pl-4 transition-[border-color,box-shadow] duration-150 focus-within:border-zinc-300 focus-within:ring-4 focus-within:ring-zinc-900/5">
      <input
        // 16px keeps iOS from zooming the page when the box gets focus.
        className="h-9 min-w-0 flex-1 bg-transparent text-base text-zinc-900 outline-none placeholder:text-zinc-400 disabled:cursor-not-allowed"
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
        disabled={disabled}
        readOnly={!onChange}
        aria-label={placeholder}
      />
      <button
        type="submit"
        aria-label={sendLabel}
        disabled={!canSend}
        aria-busy={sending || undefined}
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-400 transition-[background-color,color,transform] duration-150 ease-out outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/30 focus-visible:ring-offset-2 enabled:active:scale-95 disabled:cursor-not-allowed"
        style={canSend ? { backgroundColor: color, color: onColor } : undefined}
      >
        {sending ? <LoaderCircle className="size-4 animate-spin" /> : <ArrowUp className="size-[18px]" strokeWidth={2.25} />}
      </button>
    </div>
  );
}

/** The loader's bubble, drawn in React for the dashboard preview. packages/embed draws the real one. */
export function WidgetLauncher({ color, onColor, open }: Accent & { open: boolean }) {
  const Icon = open ? ChevronDown : MessageCircle;
  return (
    <div className="flex size-14 items-center justify-center rounded-full shadow-[0_1px_2px_rgba(24,24,27,0.12),0_8px_24px_rgba(24,24,27,0.18)]" style={{ backgroundColor: color, color: onColor }} aria-hidden="true">
      <Icon className="size-[26px]" strokeWidth={2} />
    </div>
  );
}
