import { Suspense } from "react";

import { InboxPage } from "@/components/inbox/inbox-page";

export default function Inbox() {
  // The Inbox reads its filters and open item from the URL.
  return <Suspense><InboxPage /></Suspense>;
}
