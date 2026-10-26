import { WhiteLabelPage, whiteLabelPageSeo } from "@/marketing/pages/WhiteLabelPage";
import { localeFrom, type LocaleParams } from "@/marketing/route-params";
import { pageMetadata } from "@/marketing/seo/page-seo";

export async function generateMetadata({ params }: LocaleParams) {
  return pageMetadata(whiteLabelPageSeo(await localeFrom(params)));
}

export default async function Page({ params }: LocaleParams) {
  return <WhiteLabelPage locale={await localeFrom(params)} />;
}
