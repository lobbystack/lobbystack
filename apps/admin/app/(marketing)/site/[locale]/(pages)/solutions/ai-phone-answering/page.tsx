import { SolutionFolderPage, solutionFolderPageSeo } from "@/marketing/pages/SolutionPage";
import { localeFrom, type LocaleParams } from "@/marketing/route-params";
import { pageMetadata } from "@/marketing/seo/page-seo";

// BespokeSolutionPage in English, the translated shared page in other locales.
export async function generateMetadata({ params }: LocaleParams) {
  return pageMetadata(solutionFolderPageSeo(await localeFrom(params), "phone"));
}

export default async function Page({ params }: LocaleParams) {
  return <SolutionFolderPage locale={await localeFrom(params)} kind="phone" />;
}
