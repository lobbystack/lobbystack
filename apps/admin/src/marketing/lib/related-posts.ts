// Picks the posts that follow `current` in `posts`, wrapping around the list.
// Taking the next N instead of the first N spreads "Related reading" links
// across the whole category, so older posts still get internal links.
export const nextInRotation = <T>(
  posts: T[],
  current: T,
  count: number,
  isSame: (a: T, b: T) => boolean
): T[] => {
  const others = posts.filter((post) => !isSame(post, current))
  if (others.length <= count) return others

  const index = posts.findIndex((post) => isSame(post, current))
  if (index === -1) return others.slice(0, count)

  const after = posts.slice(index + 1).filter((post) => !isSame(post, current))
  const before = posts.slice(0, index).filter((post) => !isSame(post, current))
  return [...after, ...before].slice(0, count)
}
