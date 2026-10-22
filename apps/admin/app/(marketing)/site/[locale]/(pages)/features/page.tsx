import { FeaturesPage, featuresPageSeo } from "@/marketing/pages/FeaturesPage";
import { localeFrom, type LocaleParams } from "@/marketing/route-params";
import { pageMetadata } from "@/marketing/seo/page-seo";

export async function generateMetadata({ params }: LocaleParams) {
  return pageMetadata(featuresPageSeo(await localeFrom(params)));
}

export default async function Page({ params }: LocaleParams) {
  return <FeaturesPage locale={await localeFrom(params)} />;
}
