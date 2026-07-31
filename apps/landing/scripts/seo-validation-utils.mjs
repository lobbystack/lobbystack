const HTML_ENTITIES = {
  "&amp;": "&",
  "&quot;": '"',
  "&#39;": "'",
  "&lt;": "<",
  "&gt;": ">",
}

export const decodeHtmlEntities = (value = "") =>
  value.replace(
    /&(amp|quot|#39|lt|gt);/g,
    (entity) => HTML_ENTITIES[entity] ?? entity
  )

export const resolveHttpUrl = (href, base) => {
  let target
  try {
    target = new URL(href, base)
  } catch {
    return undefined
  }

  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return undefined
  }

  return target
}
