import { BlogIndexPage, blogIndexPageSeo } from "@/marketing/pages/BlogIndexPage";
import { localeFrom, type LocaleParams } from "@/marketing/route-params";
import { pageMetadata } from "@/marketing/seo/page-seo";

export async function generateMetadata({ params }: LocaleParams) {
  return pageMetadata(blogIndexPageSeo(await localeFrom(params)));
}

export default async function Page({ params }: LocaleParams) {
  return <BlogIndexPage locale={await localeFrom(params)} />;
}
