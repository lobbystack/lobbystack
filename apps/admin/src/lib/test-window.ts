import { useSyncExternalStore } from "react";

/**
 * The dashboard's shell mounts one test window, and it owns the
 * voice session. Other surfaces open it through this registry so they never
 * mount a second voice client.
 */
export type TestWindowOptions = {
  /** The agent to test. Without it the window tests the default agent. */
  agentId?: string;
};

type Opener = (options: TestWindowOptions) => void;

let opener: Opener | null = null;
const subscribers = new Set<() => void>();

function notify(): void {
  for (const subscriber of subscribers) subscriber();
}

export function registerTestWindow(next: Opener): () => void {
  opener = next;
  notify();
  return () => {
    if (opener === next) {
      opener = null;
      notify();
    }
  };
}

function subscribeTestWindow(onChange: () => void): () => void {
  subscribers.add(onChange);
  return () => {
    subscribers.delete(onChange);
  };
}

/** Whether this page has a test window to open. */
export function useTestWindowReady(): boolean {
  return useSyncExternalStore(subscribeTestWindow, () => opener !== null, () => false);
}

export function openTestWindow(options: TestWindowOptions = {}): boolean {
  if (!opener) return false;
  opener(options);
  return true;
}

const endListeners = new Set<() => void>();

/** Surfaces that react to a finished call subscribe here; the window announces it. */
export function subscribeTestCallEnded(onEnded: () => void): () => void {
  endListeners.add(onEnded);
  return () => {
    endListeners.delete(onEnded);
  };
}

export function announceTestCallEnded(): void {
  for (const listener of endListeners) listener();
}

const chatReplyListeners = new Set<() => void>();

/** A test chat keeps no record the browser can read, so surfaces that react to a reply subscribe here. */
export function subscribeTestChatReplied(onReplied: () => void): () => void {
  chatReplyListeners.add(onReplied);
  return () => {
    chatReplyListeners.delete(onReplied);
  };
}

export function announceTestChatReplied(): void {
  for (const listener of chatReplyListeners) listener();
}

let callActive = false;

/**
 * Surfaces that must stay out of the way during a call read this. The window
 * owns the session, so it is the only writer.
 */
export function setTestCallActive(active: boolean): void {
  callActive = active;
}

export function isTestCallActive(): boolean {
  return callActive;
}

/** Announces the end of the running call once, however it ended. */
export function finishTestCall(): void {
  if (!callActive) return;
  callActive = false;
  announceTestCallEnded();
}
