import { notFound } from "next/navigation";

import { blogCanonicalSlug, getBlogPosts } from "@/marketing/content/blog";
import { isLocale } from "@/marketing/i18n";
import { BlogPostPage, blogPostPageSeo } from "@/marketing/pages/BlogPostPage";
import { localeFrom } from "@/marketing/route-params";
import { pageMetadata } from "@/marketing/seo/page-seo";
import { marketingStaticParams } from "@/marketing/build";

type BlogPostParams = { params: Promise<{ locale: string; slug: string }> };

// Only the posts written in this locale, as Astro's getStaticPaths built them.
export const dynamicParams = false;

export async function generateStaticParams({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) return [];
  const posts = await getBlogPosts(params.locale);
  return marketingStaticParams(posts.map((entry) => ({ slug: blogCanonicalSlug(entry) })));
}

async function postFrom(params: BlogPostParams["params"]) {
  const locale = await localeFrom(params);
  const { slug } = await params;
  const entry = (await getBlogPosts(locale)).find((post) => blogCanonicalSlug(post) === slug);
  if (!entry) notFound();
  return { locale, entry };
}

export async function generateMetadata({ params }: BlogPostParams) {
  const { locale, entry } = await postFrom(params);
  return pageMetadata(blogPostPageSeo(locale, entry));
}

export default async function Page({ params }: BlogPostParams) {
  const { locale, entry } = await postFrom(params);
  return <BlogPostPage locale={locale} entry={entry} />;
}
