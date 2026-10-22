"use client"

import { useEffect } from "react"

/**
 * Copies a button's data-copy-command to the clipboard and swaps its icon to a
 * check mark for a moment. The buttons are server-rendered; this only attaches
 * the listeners.
 */
export function CopyCommandButtons() {
  useEffect(() => {
    const timers = new Set<ReturnType<typeof setTimeout>>()
    const cleanups = [...document.querySelectorAll<HTMLButtonElement>("[data-copy-command]")].map((button) => {
      const onClick = async () => {
        try {
          await navigator.clipboard.writeText(button.dataset.copyCommand ?? "")
        } catch {
          return
        }
        const idle = button.querySelector("[data-copy-idle]")
        const done = button.querySelector("[data-copy-done]")
        idle?.classList.add("hidden")
        done?.classList.remove("hidden")
        const timer = setTimeout(() => {
          timers.delete(timer)
          idle?.classList.remove("hidden")
          done?.classList.add("hidden")
        }, 1500)
        timers.add(timer)
      }
      button.addEventListener("click", onClick)
      return () => button.removeEventListener("click", onClick)
    })
    return () => {
      cleanups.forEach((cleanup) => cleanup())
      timers.forEach((timer) => clearTimeout(timer))
    }
  }, [])
  return null
}
