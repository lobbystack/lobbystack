"use client";

import ErrorPage from "./error";

export default function GlobalError(props: { error: Error & { digest?: string }; retry: () => void }) {
  return <html><body><ErrorPage {...props} /></body></html>;
}
