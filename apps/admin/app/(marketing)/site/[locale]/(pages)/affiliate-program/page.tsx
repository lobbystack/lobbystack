import { AffiliateProgramPage, affiliateProgramPageSeo } from "@/marketing/pages/AffiliateProgramPage";
import { localeFrom, type LocaleParams } from "@/marketing/route-params";
import { pageMetadata } from "@/marketing/seo/page-seo";

export async function generateMetadata({ params }: LocaleParams) {
  return pageMetadata(affiliateProgramPageSeo(await localeFrom(params)));
}

export default async function Page({ params }: LocaleParams) {
  return <AffiliateProgramPage locale={await localeFrom(params)} />;
}
