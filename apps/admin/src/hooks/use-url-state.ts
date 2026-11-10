"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

/**
 * Keeps a view in the query string, such as the analytics range or a call's tab. The server can't see the query
 * string, so `read` runs after mount and the view starts at `initial`; every change then goes back into the URL
 * through `write`, which edits the parameters in place.
 */
export function useUrlState<T>({
  initial,
  read,
  resetKey,
  write,
}: {
  initial: T;
  read: () => T;
  /** Reads the URL again when this changes, such as the record the view belongs to. */
  resetKey?: string;
  write: (value: T, url: URL) => void;
}): { ready: boolean; setValue: Dispatch<SetStateAction<T>>; value: T } {
  const [value, setValue] = useState(initial);
  const [ready, setReady] = useState(false);

  // The view is read after mount so the server's markup and the first client render still match.
  useEffect(() => {
    setValue(read());
    setReady(true);
  }, [read, resetKey]);

  // Keeps the URL in step with the view, leaving out whatever `write` doesn't name.
  useEffect(() => {
    if (!ready) return;
    const url = new URL(window.location.href);
    write(value, url);
    if (url.href !== window.location.href) window.history.replaceState(window.history.state, "", url);
  }, [ready, value, write]);

  return { ready, setValue, value };
}
