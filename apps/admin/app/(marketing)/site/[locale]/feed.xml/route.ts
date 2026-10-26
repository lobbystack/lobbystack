import { blogCanonicalSlug, getBlogPosts } from "@/marketing/content/blog";
import { DEFAULT_DESCRIPTION, SITE_NAME, absoluteUrl } from "@/marketing/lib/seo";
import { marketingStaticParams } from "@/marketing/build";

// Prerendered once, for the unprefixed English site.
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return marketingStaticParams([{ locale: "en" }]);
}

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// A light Markdown conversion for feed items: headings, lists and paragraphs
// only, separate from the blog pages' renderer.
const markdownToHtml = (markdown = "") =>
  markdown
    .split(/\n{2,}/)
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return "";
      if (trimmed.startsWith("## ")) return `<h2>${escapeHtml(trimmed.slice(3))}</h2>`;
      if (trimmed.startsWith("# ")) return `<h1>${escapeHtml(trimmed.slice(2))}</h1>`;
      if (trimmed.startsWith("- ")) {
        const items = trimmed
          .split("\n")
          .map((line) => `<li>${escapeHtml(line.replace(/^-\s+/, ""))}</li>`)
          .join("");
        return `<ul>${items}</ul>`;
      }
      return `<p>${escapeHtml(trimmed)}</p>`;
    })
    .join("\n");

// Escapes the five XML special characters, apostrophes and quotes included.
const xml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/'/g, "&apos;").replace(/"/g, "&quot;");

export async function GET() {
  const posts = await getBlogPosts("en");
  const items = posts
    .map((post) => {
      const link = absoluteUrl(`/blog/${blogCanonicalSlug(post)}/`);
      return [
        "<item>",
        `<title>${xml(post.data.title)}</title>`,
        `<link>${xml(link)}</link>`,
        `<guid isPermaLink="true">${xml(link)}</guid>`,
        `<description>${xml(post.data.description)}</description>`,
        `<pubDate>${post.data.pubDate.toUTCString()}</pubDate>`,
        `<content:encoded>${xml(markdownToHtml(post.body))}</content:encoded>`,
        post.data.category ? `<category>${xml(post.data.category)}</category>` : "",
        "</item>",
      ].join("");
    })
    .join("");
  const body =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel>' +
    `<title>${xml(`${SITE_NAME} Blog`)}</title>` +
    `<description>${xml(DEFAULT_DESCRIPTION)}</description>` +
    `<link>${xml(absoluteUrl("/"))}</link>` +
    "<language>en-us</language>" +
    items +
    "</channel></rss>";
  return new Response(body, { headers: { "Content-Type": "application/xml" } });
}
