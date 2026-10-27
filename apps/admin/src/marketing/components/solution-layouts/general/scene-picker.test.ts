import { describe, expect, it } from "vitest"

import { SUPPORTED_LOCALES as locales } from "@/marketing/i18n"
import { getLocalizedSeoLandingPage, localizedSeoLandingPages } from "@/marketing/lib/localized-seo-landing-pages"
import type { SeoLandingPage } from "@/marketing/lib/seo-landing-pages"

import { heroSceneFor, sceneTilt, sectionScenesFor } from "./scene-picker"

const folderPages = ["/solutions/ai-phone-answering/", "/solutions/ai-appointment-scheduler/", "/solutions/ai-receptionist-for-home-services/"]

function generalPages() {
  return locales.flatMap((locale) => [
    ...localizedSeoLandingPages(locale),
    ...folderPages.map((path) => getLocalizedSeoLandingPage(locale, path)).filter((page): page is SeoLandingPage => Boolean(page)),
  ])
}

describe("general layout scenes", () => {
  it("gives every section a scene that differs from its neighbours", () => {
    for (const page of generalPages()) {
      const hero = heroSceneFor(page)
      const scenes = sectionScenesFor(page)
      expect(scenes).toHaveLength(page.sections.length)
      const row = hero ? [hero, ...scenes] : scenes
      row.slice(1).forEach((scene, index) => {
        expect(scene.name, `${page.path} section ${index + 1}`).not.toBe(row[index]?.name)
      })
    }
  })

  it("draws the salons and about pages with their own scenes", () => {
    for (const locale of locales) {
      const salons = getLocalizedSeoLandingPage(locale, "/solutions/ai-receptionist-for-salons-and-spas/")
      const about = getLocalizedSeoLandingPage(locale, "/about/")
      expect(salons && heroSceneFor(salons)).toEqual({ kind: "general", name: "salonDay" })
      expect(about && heroSceneFor(about)).toEqual({ kind: "general", name: "repo" })
      expect(salons && sectionScenesFor(salons).map((scene) => scene.name)).toEqual([
        "stylists",
        "reschedule",
        "serviceMenu",
        "eveningCalls",
      ])
    }
  })

  it("alternates the tilt of the salons page's scenes", () => {
    const salons = getLocalizedSeoLandingPage("en", "/solutions/ai-receptionist-for-salons-and-spas/")
    if (!salons) throw new Error("missing salons page")
    const hero = heroSceneFor(salons)
    const tilts = [hero, ...sectionScenesFor(salons)].map((scene) => (scene ? sceneTilt(scene) : undefined))
    tilts.slice(1).forEach((tilt, index) => expect(tilt).not.toBe(tilts[index]))
  })

  it("picks a hand-off scene for a section about urgent calls", () => {
    const page = getLocalizedSeoLandingPage("fr", "/solutions/ai-receptionist-for-locksmiths/")
    if (!page) throw new Error("missing French locksmiths page")
    const index = page.sections.findIndex((section) => /urgence/i.test(section.title))
    expect(index).toBeGreaterThanOrEqual(0)
    expect(sectionScenesFor(page)[index]?.name).toBe("handoff")
  })
})
