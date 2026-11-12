// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { Navbar } from "@/marketing/components/Navbar"
import { resetSignedInCheck } from "@/marketing/components/NavbarAuthLinks"

afterEach(() => {
  cleanup()
  resetSignedInCheck()
  vi.unstubAllGlobals()
})

function answer(body: unknown, ok = true) {
  const fetch = vi.fn(async () => ({ ok, json: async () => body }))
  vi.stubGlobal("fetch", fetch)
  return fetch
}

async function renderNavbar(locale: "en" | "fr" = "en") {
  render(<Navbar locale={locale} />)
  // Let the session check settle.
  await act(async () => { await Promise.resolve() })
  const desktop = screen.getAllByRole("banner")[0]!
  const mobile = document.getElementById("site-mobile-menu")!
  return { desktop, mobile }
}

const visibleLinks = (container: HTMLElement) =>
  within(container).queryAllByRole("link").map((link) => link.textContent)

describe("navbar auth links", () => {
  it("shows Log in and Try for free to a signed-out visitor", async () => {
    const fetch = answer({ signedIn: false })
    const { mobile } = await renderNavbar()

    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith("https://app.lobbystack.com/api/marketing/session", { credentials: "include", cache: "no-store" })
    expect(screen.queryByRole("link", { name: "Dashboard" })).toBeNull()
    expect(screen.getAllByRole("link", { name: "Log in" })).toHaveLength(2)
    expect(screen.getAllByRole("link", { name: "Try for free" })).toHaveLength(2)
    expect(visibleLinks(mobile)).toEqual(expect.arrayContaining(["Log in", "Try for free"]))
  })

  it("keeps the signed-out links when the check fails", async () => {
    answer({ error: "nope" }, false)
    await renderNavbar()
    expect(screen.queryByRole("link", { name: "Dashboard" })).toBeNull()
    expect(screen.getAllByRole("link", { name: "Try for free" })).toHaveLength(2)
  })

  it("replaces them with one Dashboard link for a signed-in visitor, in their language", async () => {
    answer({ signedIn: true })
    const { mobile } = await renderNavbar("fr")

    const dashboards = screen.getAllByRole("link", { name: "Tableau de bord" })
    expect(dashboards).toHaveLength(2)
    for (const link of dashboards) expect(link.getAttribute("href")).toBe("https://app.lobbystack.com/?lng=fr")
    expect(visibleLinks(mobile)).not.toContain("Connexion")
    expect(visibleLinks(mobile)).not.toContain("Essayer gratuitement")
    // The desktop bar keeps the signed-out links hidden, so its width doesn't change.
    expect(screen.queryByRole("link", { name: "Connexion" })).toBeNull()
    expect(screen.queryByRole("link", { name: "Essayer gratuitement" })).toBeNull()
    const hidden = document.querySelector('[aria-hidden="true"][inert]')
    expect(hidden?.className).toContain("invisible")
    expect(hidden?.textContent).toContain("Connexion")
  })
})
