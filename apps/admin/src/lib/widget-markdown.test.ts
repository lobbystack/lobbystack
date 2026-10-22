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

function links(markdown: string) {
  const element = document.createElement("div");
  element.innerHTML = renderSafeMarkdown(markdown);
  return { text: element.textContent, links: [...element.querySelectorAll("a")].map((anchor) => ({ text: anchor.textContent, href: anchor.getAttribute("href"), target: anchor.getAttribute("target") })) };
}

it("links a plain web address and leaves the punctuation around it out", () => {
  const rendered = links('Book at https://acme.example/book. (Or see https://acme.example/a), "https://acme.example/b" and \'https://acme.example/c\'!');
  expect(rendered.links).toEqual(["book", "a", "b", "c"].map((path) => ({ text: `https://acme.example/${path}`, href: `https://acme.example/${path}`, target: "_blank" })));
  expect(rendered.text).toBe('Book at https://acme.example/book. (Or see https://acme.example/a), "https://acme.example/b" and \'https://acme.example/c\'!');
});

it("keeps a web address's query string, and links one on its own line, in bold or in code", () => {
  expect(links("Book here:\nhttps://acme.example/book?service=cut&day=mon\n**https://acme.example/menu** `https://acme.example/map`").links.map((link) => link.href)).toEqual([
    "https://acme.example/book?service=cut&day=mon",
    "https://acme.example/menu",
    "https://acme.example/map",
  ]);
});

it("links a Markdown link once, with its own text", () => {
  expect(links("[https://acme.example/book](https://acme.example/book) or [our booking page](https://acme.example/book)").links).toEqual([
    { text: "https://acme.example/book", href: "https://acme.example/book", target: "_blank" },
    { text: "our booking page", href: "https://acme.example/book", target: "_blank" },
  ]);
});

it("ends a plain web address at a quote or angle bracket, so it can't add attributes or tags", () => {
  const element = document.createElement("div");
  element.innerHTML = renderSafeMarkdown('https://acme.example/"onmouseover="alert(1) https://acme.example/\'onfocus=\'alert(1) https://acme.example/<script>alert(1)</script> <a href="https://acme.example/x">x</a>');
  expect(element.querySelector("[onmouseover], [onfocus], script")).toBeNull();
  expect([...element.querySelectorAll("a")].map((anchor) => anchor.getAttribute("href"))).toEqual(["https://acme.example/", "https://acme.example/", "https://acme.example/", "https://acme.example/x"]);
});

it("doesn't link addresses with other schemes or without one", () => {
  expect(links("javascript:alert(1) data:text/html,hi mailto:hello@acme.example www.acme.example ftp://acme.example").links).toEqual([]);
});
