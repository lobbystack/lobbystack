import { AboutPage, aboutPageSeo } from "@/marketing/pages/AboutPage";
import { localeFrom, type LocaleParams } from "@/marketing/route-params";
import { pageMetadata } from "@/marketing/seo/page-seo";

export async function generateMetadata({ params }: LocaleParams) {
  return pageMetadata(aboutPageSeo(await localeFrom(params)));
}

export default async function Page({ params }: LocaleParams) {
  return <AboutPage locale={await localeFrom(params)} />;
}
