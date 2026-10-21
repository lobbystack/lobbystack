import { DocsApiPage, docsApiPageSeo } from "@/marketing/pages/DocsApiPage";
import { localeFrom, type LocaleParams } from "@/marketing/route-params";
import { pageMetadata } from "@/marketing/seo/page-seo";

export async function generateMetadata({ params }: LocaleParams) {
  return pageMetadata(docsApiPageSeo(await localeFrom(params)));
}

export default async function Page({ params }: LocaleParams) {
  return <DocsApiPage locale={await localeFrom(params)} />;
}
