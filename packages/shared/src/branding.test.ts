import { describe, expect, it } from "vitest";

import {
  BRAND_LOGO_PATH,
  DEFAULT_APP_NAME,
  MAX_BRAND_LOGO_BYTES,
  brandLogoContentType,
  normalizeAppName,
  normalizeLogoUrl,
  readBrandingEnvironment,
  resolveBranding,
} from "./branding";

const svg = (body: string, prologue = "") => new TextEncoder().encode(`${prologue}<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${body}</svg>`);

describe("normalizeAppName", () => {
  it("trims and collapses whitespace", () => {
    expect(normalizeAppName("  Allo \n Place ")).toBe("Allo Place");
  });

  it("refuses empty, long and invisible-character names", () => {
    expect(normalizeAppName("   ")).toBeNull();
    expect(normalizeAppName("x".repeat(41))).toBeNull();
    expect(normalizeAppName("x".repeat(40))).toBe("x".repeat(40));
    expect(normalizeAppName("Allo‮Place")).toBeNull();
    expect(normalizeAppName("Allo\u0000Place")).toBeNull();
    expect(normalizeAppName(42)).toBeNull();
  });
});

describe("normalizeLogoUrl", () => {
  it("accepts https URLs and same-origin paths", () => {
    expect(normalizeLogoUrl(" https://cdn.example.com/logo.svg ")).toBe("https://cdn.example.com/logo.svg");
    expect(normalizeLogoUrl("/brand/acme.svg")).toBe("/brand/acme.svg");
  });

  it("refuses addresses the content policy would block or that hide another host", () => {
    expect(normalizeLogoUrl("http://cdn.example.com/logo.svg")).toBeNull();
    expect(normalizeLogoUrl("//cdn.example.com/logo.svg")).toBeNull();
    expect(normalizeLogoUrl("/\\cdn.example.com/logo.svg")).toBeNull();
    expect(normalizeLogoUrl("https://user:secret@cdn.example.com/logo.svg")).toBeNull();
    expect(normalizeLogoUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeLogoUrl("data:image/png;base64,AAAA")).toBeNull();
    expect(normalizeLogoUrl("logo.svg")).toBeNull();
  });
});

describe("readBrandingEnvironment", () => {
  it("reads both variables and names the unusable ones", () => {
    expect(readBrandingEnvironment({ BRAND_APP_NAME: "Acme Desk", BRAND_LOGO_URL: "https://cdn.example.com/a.png" })).toEqual({ appName: "Acme Desk", logoUrl: "https://cdn.example.com/a.png", invalid: [] });
    expect(readBrandingEnvironment({ BRAND_APP_NAME: "x".repeat(60), BRAND_LOGO_URL: "ftp://example.com/a.png" })).toEqual({ appName: null, logoUrl: null, invalid: ["BRAND_APP_NAME", "BRAND_LOGO_URL"] });
    expect(readBrandingEnvironment({ BRAND_APP_NAME: " " })).toEqual({ appName: null, logoUrl: null, invalid: [] });
  });
});

describe("resolveBranding", () => {
  const none = { appName: null, logoUrl: null };

  it("falls back to LobbyStack and its built-in mark", () => {
    expect(resolveBranding({ environment: none, saved: null })).toEqual({
      appName: DEFAULT_APP_NAME,
      logoUrl: null,
      sources: { appName: "default", logoUrl: "default" },
    });
  });

  it("uses what onboarding saved, with a logo URL that changes with the logo", () => {
    expect(resolveBranding({ environment: none, saved: { appName: "Acme Desk", logoVersion: "abc123" } })).toEqual({
      appName: "Acme Desk",
      logoUrl: `${BRAND_LOGO_PATH}?v=abc123`,
      sources: { appName: "database", logoUrl: "database" },
    });
  });

  it("lets each environment variable win over the saved value for its field only", () => {
    expect(resolveBranding({ environment: { appName: "Hello Front Desk", logoUrl: null }, saved: { appName: "Acme Desk", logoVersion: "abc123" } })).toEqual({
      appName: "Hello Front Desk",
      logoUrl: `${BRAND_LOGO_PATH}?v=abc123`,
      sources: { appName: "environment", logoUrl: "database" },
    });
    expect(resolveBranding({ environment: { appName: null, logoUrl: "https://cdn.example.com/a.png" }, saved: { appName: null, logoVersion: null } })).toEqual({
      appName: DEFAULT_APP_NAME,
      logoUrl: "https://cdn.example.com/a.png",
      sources: { appName: "default", logoUrl: "environment" },
    });
  });
});

describe("brandLogoContentType", () => {
  it("reads the type from the bytes", () => {
    expect(brandLogoContentType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe("image/png");
    expect(brandLogoContentType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(brandLogoContentType(new TextEncoder().encode("RIFF\u0000\u0000\u0000\u0000WEBPVP8 "))).toBe("image/webp");
    expect(brandLogoContentType(svg("<path d=\"M0 0h24v24H0z\"/>"))).toBe("image/svg+xml");
    expect(brandLogoContentType(svg("<rect width=\"4\" height=\"4\"/>", "﻿<?xml version=\"1.0\"?>\n<!-- Generator: Illustrator -->\n<!DOCTYPE svg PUBLIC \"-//W3C//DTD SVG 1.1//EN\" \"http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd\">\n"))).toBe("image/svg+xml");
  });

  it("refuses other files, empty files and files over the limit", () => {
    expect(brandLogoContentType(new TextEncoder().encode("GIF89a"))).toBeNull();
    expect(brandLogoContentType(new TextEncoder().encode("<html><svg xmlns=\"http://www.w3.org/2000/svg\"></svg></html>"))).toBeNull();
    expect(brandLogoContentType(new TextEncoder().encode("<svg viewBox=\"0 0 1 1\"></svg>"))).toBeNull();
    expect(brandLogoContentType(new Uint8Array())).toBeNull();
    const large = new Uint8Array(MAX_BRAND_LOGO_BYTES + 1);
    large.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(brandLogoContentType(large)).toBeNull();
  });

  it("refuses SVGs that could run script or expand entities", () => {
    for (const body of [
      "<script>alert(1)</script>",
      "<SCRIPT >alert(1)</SCRIPT>",
      "<rect onload=\"alert(1)\"/>",
      "<foreignObject><div/></foreignObject>",
      "<a href=\"javascript:alert(1)\"><rect/></a>",
      "<iframe src=\"https://example.com\"/>",
      "<image href=\"data:text/html,<b>x</b>\"/>",
    ]) {
      expect(brandLogoContentType(svg(body)), body).toBeNull();
    }
    expect(brandLogoContentType(svg("<rect/>", "<!DOCTYPE svg [<!ENTITY a \"aaaa\">]>"))).toBeNull();
  });
});
