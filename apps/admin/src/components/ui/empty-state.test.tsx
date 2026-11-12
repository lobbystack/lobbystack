// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { EmptyState } from "./empty-state";

afterEach(cleanup);

describe("EmptyState", () => {
  it("shows the title alone in a dashed box", () => {
    const { container } = render(<EmptyState className="xl:flex-1" title="No webhooks yet" />);
    const box = container.firstElementChild as HTMLElement;
    expect(box.dataset.slot).toBe("empty-state");
    expect(box.className).toContain("border-dashed");
    expect(box.className).toContain("xl:flex-1");
    expect(screen.getByText("No webhooks yet").className).toContain("type-empty-title");
    expect(container.querySelector("[data-slot='empty-state-description']")).toBeNull();
    expect(container.querySelector("[data-slot='empty-state-action']")).toBeNull();
  });

  it("adds the description and action under the title", () => {
    render(<EmptyState action={<button type="button">New key</button>} description="Create a key to embed the widget." title="No keys" />);
    expect(screen.getByText("Create a key to embed the widget.").className).toContain("type-empty-description");
    expect(screen.getByRole("button", { name: "New key" }).closest("[data-slot='empty-state-action']")).toBeTruthy();
  });
});
