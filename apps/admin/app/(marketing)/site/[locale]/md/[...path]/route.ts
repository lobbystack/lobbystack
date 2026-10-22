import { SUPPORTED_LOCALES, isLocale } from "@/marketing/i18n";
import { markdownTwin, markdownTwinPaths } from "@/marketing/markdown-twins";
import { marketingStaticParams } from "@/marketing/build";

// Markdown twins of the pages, at /pricing.md, /fr/index.md, /blog/<slug>.md.
// The proxy rewrites those paths here.
export const dynamic = "force-static";
export const dynamicParams = false;

export async function generateStaticParams() {
  const perLocale = await Promise.all(
    SUPPORTED_LOCALES.map(async (locale) => (await markdownTwinPaths(locale)).map((path) => ({ locale, path: path.split("/") }))),
  );
  return marketingStaticParams(perLocale.flat());
}

export async function GET(_request: Request, { params }: { params: Promise<{ locale: string; path: string[] }> }) {
  const { locale, path } = await params;
  const response = isLocale(locale) ? await markdownTwin(locale, path.join("/")) : null;
  return response ?? new Response("Not found", { status: 404 });
}
