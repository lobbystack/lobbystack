import { locale } from "next/root-params";

import { isLocale, type Locale } from "@/marketing/i18n";
import { NotFoundPage, notFoundPageSeo } from "@/marketing/pages/NotFoundPage";

// not-found.tsx gets no params and can't export metadata, so the locale comes
// from the root params and the title and description are rendered here.
export default async function MarketingNotFound() {
  const value: unknown = await locale();
  const pageLocale: Locale = typeof value === "string" && isLocale(value) ? value : "en";
  const seo = notFoundPageSeo(pageLocale);
  return (
    <>
      {seo.title ? <title>{seo.title}</title> : null}
      {seo.description ? <meta name="description" content={seo.description} /> : null}
      <NotFoundPage locale={pageLocale} />
    </>
  );
}
