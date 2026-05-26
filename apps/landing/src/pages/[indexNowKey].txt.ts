import { createIndexNowKeyRoute } from "@jdevalk/astro-seo-graph"

const key = import.meta.env.INDEXNOW_KEY

export const getStaticPaths = () =>
  key ? [{ params: { indexNowKey: key } }] : []

export const GET = createIndexNowKeyRoute({
  key: key ?? "indexnow-disabled",
})
