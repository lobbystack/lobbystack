import { ChangelogPage, changelogPageSeo } from "@/marketing/pages/ChangelogPage";
import { localeFrom, type LocaleParams } from "@/marketing/route-params";
import { pageMetadata } from "@/marketing/seo/page-seo";

export async function generateMetadata({ params }: LocaleParams) {
  return pageMetadata(await changelogPageSeo(await localeFrom(params)));
}

export default async function Page({ params }: LocaleParams) {
  return <ChangelogPage locale={await localeFrom(params)} />;
}
