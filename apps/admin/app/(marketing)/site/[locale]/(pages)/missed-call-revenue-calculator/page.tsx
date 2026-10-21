import { CalculatorPage, calculatorPageSeo } from "@/marketing/pages/CalculatorPage";
import { localeFrom, type LocaleParams } from "@/marketing/route-params";
import { pageMetadata } from "@/marketing/seo/page-seo";

export async function generateMetadata({ params }: LocaleParams) {
  return pageMetadata(calculatorPageSeo(await localeFrom(params)));
}

export default async function Page({ params }: LocaleParams) {
  return <CalculatorPage locale={await localeFrom(params)} />;
}
