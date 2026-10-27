import { SelfHostedPricingPage, selfHostedPricingPageSeo } from "@/marketing/pages/SelfHostedPricingPage";
import { localeFrom, type LocaleParams } from "@/marketing/route-params";
import { pageMetadata } from "@/marketing/seo/page-seo";

export async function generateMetadata({ params }: LocaleParams) {
  return pageMetadata(selfHostedPricingPageSeo(await localeFrom(params)));
}

export default async function Page({ params }: LocaleParams) {
  return <SelfHostedPricingPage locale={await localeFrom(params)} />;
}
