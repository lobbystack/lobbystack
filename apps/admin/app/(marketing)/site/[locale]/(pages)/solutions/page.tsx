import { SolutionsIndexPage, solutionsIndexPageSeo } from "@/marketing/pages/SolutionsIndexPage";
import { localeFrom, type LocaleParams } from "@/marketing/route-params";
import { pageMetadata } from "@/marketing/seo/page-seo";

export async function generateMetadata({ params }: LocaleParams) {
  return pageMetadata(solutionsIndexPageSeo(await localeFrom(params)));
}

export default async function Page({ params }: LocaleParams) {
  return <SolutionsIndexPage locale={await localeFrom(params)} />;
}
