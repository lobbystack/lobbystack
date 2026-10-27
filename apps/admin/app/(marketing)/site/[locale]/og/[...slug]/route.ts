import path from "node:path";
import sharp from "sharp";

import { blogCollection } from "@/marketing/content/collections";
import { ogEntries } from "@/marketing/lib/pages";
import { DEFAULT_DESCRIPTION, OG_IMAGE_HEIGHT, OG_IMAGE_WIDTH } from "@/marketing/lib/seo";
import { marketingStaticParams } from "@/marketing/build";

// Social cards at /og/<page>.jpg and /og/blog/<post id>.jpg, drawn at build time.
export const dynamic = "force-static";
export const dynamicParams = false;

type OgEntry = {
  slug: string;
  title: string;
  description: string;
  coverImage?: string | undefined;
};

const entryMap = () => {
  const entries: OgEntry[] = [
    ...ogEntries.map((entry) => ({ slug: entry.slug, title: entry.title, description: entry.description })),
    ...blogCollection().map((post) => ({
      slug: `blog/${post.id}`,
      title: post.data.title,
      description: post.data.description,
      coverImage: post.data.coverImage,
    })),
  ];
  return new Map(entries.map((entry) => [entry.slug, entry]));
};

export function generateStaticParams() {
  return marketingStaticParams([...entryMap().keys()].map((slug) => ({ locale: "en", slug: `${slug}.jpg`.split("/") })));
}

const escapeXml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")

const wrap = (text: string, maxChars: number) => {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let line = ""

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word
    if (candidate.length > maxChars && line) {
      lines.push(line)
      line = word
    } else {
      line = candidate
    }
  }

  if (line) lines.push(line)
  return lines
}

const textOverlay = (entry: OgEntry) => {
  const light = Boolean(entry.coverImage)
  const titleSize = entry.title.length > 58 ? 58 : 68
  const titleLines = wrap(entry.title, entry.title.length > 58 ? 27 : 23).slice(
    0,
    3
  )
  const descriptionLines = wrap(
    entry.description || DEFAULT_DESCRIPTION,
    52
  ).slice(0, 2)

  return Buffer.from(`<svg width="${OG_IMAGE_WIDTH}" height="${OG_IMAGE_HEIGHT}" viewBox="0 0 ${OG_IMAGE_WIDTH} ${OG_IMAGE_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="${light ? "#0a0a0a" : "#f8f5f4"}" fill-opacity="${light ? 0.74 : 1}"/>
  <rect x="70" y="70" width="46" height="46" rx="12" fill="${light ? "#fafafa" : "#171717"}"/>
  <text x="134" y="103" fill="${light ? "#fafafa" : "#0a0a0a"}" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="700">LobbyStack</text>
  <text x="70" y="382" fill="${light ? "#fafafa" : "#0a0a0a"}" font-family="Arial, Helvetica, sans-serif" font-size="${titleSize}" font-weight="700">
    ${titleLines
      .map(
        (line, index) =>
          `<tspan x="70" dy="${index === 0 ? 0 : titleSize * 1.05}">${escapeXml(line)}</tspan>`
      )
      .join("")}
  </text>
  <text x="70" y="${408 + titleLines.length * titleSize * 1.05}" fill="${light ? "rgba(250,250,250,0.82)" : "#6e6058"}" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="400">
    ${descriptionLines
      .map(
        (line, index) =>
          `<tspan x="70" dy="${index === 0 ? 0 : 38}">${escapeXml(line)}</tspan>`
      )
      .join("")}
  </text>
</svg>`)
}

export async function GET(_request: Request, { params }: { params: Promise<{ locale: string; slug: string[] }> }) {
  const { slug } = await params;
  const entry = entryMap().get(slug.join("/").replace(/\.jpg$/, ""));
  if (!entry) return new Response("Not found", { status: 404 });

  const text = textOverlay(entry);
  const base =
    entry.coverImage && entry.coverImage.startsWith("/")
      ? sharp(path.join(process.cwd(), "public", entry.coverImage))
          .resize(OG_IMAGE_WIDTH, OG_IMAGE_HEIGHT, { fit: "cover" })
          .jpeg({ quality: 90 })
      : sharp({
          create: { width: OG_IMAGE_WIDTH, height: OG_IMAGE_HEIGHT, channels: 3, background: "#f8f5f4" },
        }).jpeg({ quality: 90 });

  const image = await base.composite([{ input: text, top: 0, left: 0 }]).jpeg({ quality: 90 }).toBuffer();
  return new Response(new Uint8Array(image), {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=31536000, immutable" },
  });
}
