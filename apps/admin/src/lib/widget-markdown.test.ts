// @vitest-environment jsdom
import { expect, it } from "vitest";
import { renderSafeMarkdown } from "./widget-markdown";

it("does not turn quotes in an untrusted Markdown URL into executable attributes", () => {
  const element = document.createElement("div");
  element.innerHTML = renderSafeMarkdown('[Website](https://example.invalid"onmouseover="window.parityXss=1)');
  expect(element.querySelector("[onmouseover]")).toBeNull();
  expect(element.querySelector("script")).toBeNull();
});
it("keeps HTML and non-http links inert while retaining supported formatting", () => {
  const element = document.createElement("div");
  element.innerHTML = renderSafeMarkdown('<img src=x onerror=alert(1)> **Hours** `9–5`\n[Website](https://example.invalid) [bad](javascript:alert(1))');
  expect(element.querySelector("img")).toBeNull();
  expect(element.querySelector("strong")?.textContent).toBe("Hours");
  expect(element.querySelector("code")?.textContent).toBe("9–5");
  expect(element.querySelectorAll("a")).toHaveLength(1);
  expect(element.querySelector("a")?.getAttribute("rel")).toBe("noreferrer noopener");
});
