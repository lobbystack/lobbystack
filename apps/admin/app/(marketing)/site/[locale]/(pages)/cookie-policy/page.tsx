import { CookiePolicyPage, cookiePolicyPageSeo } from "@/marketing/pages/CookiePolicyPage";
import { localeFrom, type LocaleParams } from "@/marketing/route-params";
import { pageMetadata } from "@/marketing/seo/page-seo";

export async function generateMetadata({ params }: LocaleParams) {
  return pageMetadata(cookiePolicyPageSeo(await localeFrom(params)));
}

export default async function Page({ params }: LocaleParams) {
  return <CookiePolicyPage locale={await localeFrom(params)} />;
}
