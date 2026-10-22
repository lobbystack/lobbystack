import { notFound } from "next/navigation";

// Unknown marketing paths get the localized 404 inside the marketing layout.
// Rendered per request rather than cached, so scanners can't fill the cache.
export const dynamic = "force-dynamic";

export default function MissingMarketingPage(): never {
  notFound();
}
