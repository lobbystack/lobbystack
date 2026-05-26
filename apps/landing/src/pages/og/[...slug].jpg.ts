import path from "node:path"
import type { APIRoute } from "astro"
import { getCollection } from "astro:content"
import React from "react"
import satori from "satori"
import sharp from "sharp"
import { ogEntries } from "@/lib/pages"
import { DEFAULT_DESCRIPTION, OG_IMAGE_HEIGHT, OG_IMAGE_WIDTH } from "@/lib/seo"

type OgEntry = {
  slug: string
  title: string
  description: string
  coverImage?: string
}

const h = React.createElement

const entryMap = async () => {
  const posts = await getCollection("blog")
  const entries: OgEntry[] = [
    ...ogEntries.map((entry) => ({
      slug: entry.slug,
      title: entry.title,
      description: entry.description,
    })),
    ...posts.map((post) => ({
      slug: `blog/${post.id}`,
      title: post.data.title,
      description: post.data.description,
      coverImage: post.data.coverImage,
    })),
  ]

  return new Map(entries.map((entry) => [entry.slug, entry]))
}

export const getStaticPaths = async () => {
  const entries = await entryMap()

  return [...entries.keys()].map((slug) => ({
    params: { slug },
  }))
}

const renderFrame = async (entry: OgEntry) =>
  satori(
    h(
      "div",
      {
        style: {
          width: `${OG_IMAGE_WIDTH}px`,
          height: `${OG_IMAGE_HEIGHT}px`,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "70px",
          background: entry.coverImage ? "rgba(5,10,20,0.78)" : "#f1f5f9",
          color: entry.coverImage ? "#fafafa" : "#111827",
        },
      },
      h("div", { style: { width: "46px", height: "46px" } }),
      h("div", { style: { width: "760px", height: "360px" } })
    ),
    {
      width: OG_IMAGE_WIDTH,
      height: OG_IMAGE_HEIGHT,
      fonts: [],
    }
  )

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
  <rect x="70" y="70" width="46" height="46" rx="12" fill="${light ? "#fafafa" : "#111827"}"/>
  <text x="134" y="103" fill="${light ? "#fafafa" : "#111827"}" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="700">LobbyStack</text>
  <text x="70" y="382" fill="${light ? "#fafafa" : "#111827"}" font-family="Arial, Helvetica, sans-serif" font-size="${titleSize}" font-weight="700">
    ${titleLines
      .map(
        (line, index) =>
          `<tspan x="70" dy="${index === 0 ? 0 : titleSize * 1.05}">${escapeXml(line)}</tspan>`
      )
      .join("")}
  </text>
  <text x="70" y="${408 + titleLines.length * titleSize * 1.05}" fill="${light ? "rgba(250,250,250,0.82)" : "#475569"}" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="700">
    ${descriptionLines
      .map(
        (line, index) =>
          `<tspan x="70" dy="${index === 0 ? 0 : 38}">${escapeXml(line)}</tspan>`
      )
      .join("")}
  </text>
</svg>`)
}

export const GET: APIRoute = async ({ params }) => {
  const entries = await entryMap()
  const slug = params.slug ?? "index"
  const entry = entries.get(slug)

  if (!entry) return new Response("Not found", { status: 404 })

  const frame = Buffer.from(await renderFrame(entry))
  const text = textOverlay(entry)
  const base =
    entry.coverImage && entry.coverImage.startsWith("/")
      ? sharp(path.join(process.cwd(), "public", entry.coverImage))
          .resize(OG_IMAGE_WIDTH, OG_IMAGE_HEIGHT, { fit: "cover" })
          .jpeg({ quality: 90 })
      : sharp({
          create: {
            width: OG_IMAGE_WIDTH,
            height: OG_IMAGE_HEIGHT,
            channels: 3,
            background: "#f8fafc",
          },
        }).jpeg({ quality: 90 })

  const image = await base
    .composite([
      { input: frame, top: 0, left: 0 },
      { input: text, top: 0, left: 0 },
    ])
    .jpeg({ quality: 90 })
    .toBuffer()

  return new Response(new Uint8Array(image), {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  })
}
