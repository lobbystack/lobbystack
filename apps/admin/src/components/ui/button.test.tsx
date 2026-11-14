// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { Send } from "lucide-react";
import { afterEach, describe, expect, it } from "vitest";

import { Button } from "@/components/ui/button";

afterEach(cleanup);

const icons = (button: HTMLElement) => button.querySelectorAll("svg").length;

describe("Button while loading", () => {
  it("shows the spinner in place of the icon on a square icon button", () => {
    render(<Button aria-label="Send" loading size="icon-lg"><Send /></Button>);
    const button = screen.getByRole("button", { name: "Send" });
    expect(icons(button)).toBe(1);
    expect(button.querySelector(".animate-spin")).toBeTruthy();
    expect(button.getAttribute("aria-busy")).toBe("true");
  });

  it("keeps a loading label out of sight on an icon button", () => {
    render(<Button loading loadingLabel="Sending" size="icon"><Send /></Button>);
    const button = screen.getByRole("button", { name: "Sending" });
    expect(icons(button)).toBe(1);
    expect(button.querySelector(".sr-only")?.textContent).toBe("Sending");
  });

  it("puts the spinner beside the label on a text button", () => {
    render(<Button loading loadingLabel="Saving">Save</Button>);
    const button = screen.getByRole("button", { name: "Saving" });
    expect(icons(button)).toBe(1);
    expect(button.textContent).toBe("Saving");
  });

  it("puts the spinner beside the text when there is no loading label", () => {
    render(<Button loading>Save</Button>);
    expect(screen.getByRole("button", { name: "Save" }).querySelector(".animate-spin")).toBeTruthy();
  });

  it("shows its icon when it is not loading", () => {
    render(<Button aria-label="Send" size="icon-lg"><Send /></Button>);
    expect(screen.getByRole("button", { name: "Send" }).querySelector(".animate-spin")).toBeNull();
  });
});
