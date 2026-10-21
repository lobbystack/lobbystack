import { LegalPage, legalPageSeo } from "@/marketing/pages/LegalPage";
import { localeFrom, type LocaleParams } from "@/marketing/route-params";
import { pageMetadata } from "@/marketing/seo/page-seo";

export async function generateMetadata({ params }: LocaleParams) {
  return pageMetadata(legalPageSeo(await localeFrom(params), "privacy"));
}

export default async function Page({ params }: LocaleParams) {
  return <LegalPage locale={await localeFrom(params)} kind="privacy" />;
}
