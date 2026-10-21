import { SearchPage, searchPageSeo } from "@/marketing/pages/SearchPage";
import { localeFrom, type LocaleParams } from "@/marketing/route-params";
import { pageMetadata } from "@/marketing/seo/page-seo";

export async function generateMetadata({ params }: LocaleParams) {
  return pageMetadata(searchPageSeo(await localeFrom(params)));
}

export default async function Page({ params }: LocaleParams) {
  return <SearchPage locale={await localeFrom(params)} />;
}
