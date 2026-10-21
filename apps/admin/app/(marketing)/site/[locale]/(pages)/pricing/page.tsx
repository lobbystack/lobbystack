import { PricingPage, pricingPageSeo } from "@/marketing/pages/PricingPage";
import { localeFrom, type LocaleParams } from "@/marketing/route-params";
import { pageMetadata } from "@/marketing/seo/page-seo";

export async function generateMetadata({ params }: LocaleParams) {
  return pageMetadata(pricingPageSeo(await localeFrom(params)));
}

export default async function Page({ params }: LocaleParams) {
  return <PricingPage locale={await localeFrom(params)} />;
}
