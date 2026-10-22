import { isLocale } from "@/marketing/i18n";
import { SolutionPage, solutionPageSeo, solutionPageSlugs } from "@/marketing/pages/SolutionPage";
import { localeFrom } from "@/marketing/route-params";
import { pageMetadata } from "@/marketing/seo/page-seo";
import { marketingStaticParams } from "@/marketing/build";

type SolutionParams = { params: Promise<{ locale: string; slug: string }> };

// The three solution pages with their own folders beside this one aren't listed here.
export function generateStaticParams({ params }: { params: { locale: string } }) {
  return marketingStaticParams(isLocale(params.locale) ? solutionPageSlugs(params.locale).map((slug) => ({ slug })) : []);
}

export const dynamicParams = false;

export async function generateMetadata({ params }: SolutionParams) {
  const { slug } = await params;
  return pageMetadata(solutionPageSeo(await localeFrom(params), slug));
}

export default async function Page({ params }: SolutionParams) {
  const { slug } = await params;
  return <SolutionPage locale={await localeFrom(params)} slug={slug} />;
}
