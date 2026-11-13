import { marketingStaticParams } from "@/marketing/build";
import { featurePageSlugs } from "@/marketing/lib/feature-pages";
import { FeatureDetailPage, featureDetailPageSeo } from "@/marketing/pages/FeatureDetailPage";
import { localeFrom } from "@/marketing/route-params";
import { pageMetadata } from "@/marketing/seo/page-seo";

type FeatureParams = { params: Promise<{ locale: string; feature: string }> };

// The MCP server page has its own folder beside this one and isn't listed here.
export function generateStaticParams() {
  return marketingStaticParams(featurePageSlugs.map((feature) => ({ feature })));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: FeatureParams) {
  const { feature } = await params;
  return pageMetadata(featureDetailPageSeo(await localeFrom(params), feature));
}

export default async function Page({ params }: FeatureParams) {
  const { feature } = await params;
  return <FeatureDetailPage locale={await localeFrom(params)} slug={feature} />;
}
