import { Suspense } from "react";

import { InboxPage } from "@/components/inbox/inbox-page";
import { PageIntro } from "@/components/page-intros/page-intro";

export default function Inbox() {
  // The Inbox reads its filters and open item from the URL.
  return <><Suspense><InboxPage /></Suspense><PageIntro page="inbox" /></>;
}
