import { describe, expect, it } from "vitest"

import { nextInRotation } from "./related-posts"

const same = (a: string, b: string) => a === b
const posts = ["a", "b", "c", "d", "e", "f"]

describe("nextInRotation", () => {
  it("returns the posts after the current one", () => {
    expect(nextInRotation(posts, "b", 3, same)).toEqual(["c", "d", "e"])
  })

  it("wraps around to the start of the list", () => {
    expect(nextInRotation(posts, "e", 3, same)).toEqual(["f", "a", "b"])
  })

  it("links every post from somewhere in the category", () => {
    const linked = new Set(
      posts.flatMap((post) => nextInRotation(posts, post, 3, same))
    )
    expect([...linked].sort()).toEqual(posts)
  })

  it("returns everything else when the category is small", () => {
    expect(nextInRotation(["a", "b", "c"], "a", 3, same)).toEqual(["b", "c"])
  })

  it("falls back to the first posts when the current one is missing", () => {
    expect(nextInRotation(posts, "z", 2, same)).toEqual(["a", "b"])
  })
})
