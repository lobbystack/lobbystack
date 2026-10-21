import { HomePage, homePageSeo } from "@/marketing/pages/HomePage";
import { localeFrom, type LocaleParams } from "@/marketing/route-params";
import { pageMetadata } from "@/marketing/seo/page-seo";

export async function generateMetadata({ params }: LocaleParams) {
  return pageMetadata(homePageSeo(await localeFrom(params)));
}

export default async function Page({ params }: LocaleParams) {
  return <HomePage locale={await localeFrom(params)} />;
}
