import { afterEach, expect, it, vi } from "vitest"

import { marketingSiteBuilt, marketingStaticParams } from "./build"

afterEach(() => vi.unstubAllEnvs())

it("builds the marketing site unless the build turned it off", () => {
  expect(marketingSiteBuilt()).toBe(true)
  expect(marketingStaticParams([{ locale: "en" }])).toEqual([{ locale: "en" }])
})

it("prerenders no marketing routes in a build with MARKETING_SITE=false", () => {
  vi.stubEnv("MARKETING_SITE_BUILT", "false")
  expect(marketingSiteBuilt()).toBe(false)
  expect(marketingStaticParams([{ locale: "en" }, { locale: "fr" }])).toEqual([])
})
