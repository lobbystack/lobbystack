/**
 * The dashboard mounts exactly one test-call widget, in the utility bar, and it
 * owns the voice session. Other surfaces start a call through this registry so
 * they never mount a second voice client.
 */
type Starter = () => void;

let starter: Starter | null = null;
const subscribers = new Set<() => void>();

function notify(): void {
  for (const subscriber of subscribers) subscriber();
}

export function registerTestCallStarter(next: Starter): () => void {
  starter = next;
  notify();
  return () => {
    if (starter === next) {
      starter = null;
      notify();
    }
  };
}

export function subscribeTestCallStarter(onChange: () => void): () => void {
  subscribers.add(onChange);
  return () => {
    subscribers.delete(onChange);
  };
}

export function getTestCallStarter(): Starter | null {
  return starter;
}

export function startTestCall(): boolean {
  if (!starter) return false;
  starter();
  return true;
}

const endListeners = new Set<() => void>();

/** Surfaces that react to a finished call subscribe here; the widget announces it. */
export function subscribeTestCallEnded(onEnded: () => void): () => void {
  endListeners.add(onEnded);
  return () => {
    endListeners.delete(onEnded);
  };
}

export function announceTestCallEnded(): void {
  for (const listener of endListeners) listener();
}

let callActive = false;
const activeListeners = new Set<() => void>();

/**
 * Surfaces that must stay out of the way during a call read this. The widget
 * owns the session, so it is the only writer.
 */
export function setTestCallActive(active: boolean): void {
  if (callActive === active) return;
  callActive = active;
  for (const listener of activeListeners) listener();
}

export function isTestCallActive(): boolean {
  return callActive;
}

export function subscribeTestCallActive(onChange: () => void): () => void {
  activeListeners.add(onChange);
  return () => {
    activeListeners.delete(onChange);
  };
}
