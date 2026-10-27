import { McpPage, mcpPageSeo } from "@/marketing/pages/McpPage";
import { localeFrom, type LocaleParams } from "@/marketing/route-params";
import { pageMetadata } from "@/marketing/seo/page-seo";

export async function generateMetadata({ params }: LocaleParams) {
  return pageMetadata(mcpPageSeo(await localeFrom(params)));
}

export default async function Page({ params }: LocaleParams) {
  return <McpPage locale={await localeFrom(params)} />;
}
