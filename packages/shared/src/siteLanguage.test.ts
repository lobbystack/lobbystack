import { describe, expect, it } from "vitest";

import { detectSiteLanguage, runtimeLocaleFromLangAttribute, runtimeLocaleFromText } from "./siteLanguage";

describe("runtimeLocaleFromLangAttribute", () => {
  it("maps a tag to a caller language", () => {
    expect(runtimeLocaleFromLangAttribute("fr-CA")).toBe("fr");
    expect(runtimeLocaleFromLangAttribute("pt_BR")).toBe("pt");
    expect(runtimeLocaleFromLangAttribute(" sr-Latn ")).toBe("sr");
  });

  it("refuses a language we don't speak", () => {
    expect(runtimeLocaleFromLangAttribute("ja")).toBeNull();
    expect(runtimeLocaleFromLangAttribute("")).toBeNull();
    expect(runtimeLocaleFromLangAttribute(undefined)).toBeNull();
  });
});

describe("runtimeLocaleFromText", () => {
  it("names each language from running text", () => {
    expect(runtimeLocaleFromText("Bienvenue chez nous. Nous sommes une clinique pour vous et votre famille, avec des soins dans la ville et sur le web pour les enfants.")).toBe("fr");
    expect(runtimeLocaleFromText("We are here for you and your family. Call us about the services that we can offer, with hours that work for your team and our staff.")).toBe("en");
    expect(runtimeLocaleFromText("Wir sind für Sie da und bieten Ihre Beratung auf der Seite mit unsere Hilfe von den Experten, die Sie nicht vergessen. Das ist eine gute Wahl und für Sie.")).toBe("de");
  });

  it("gives up on too little text", () => {
    expect(runtimeLocaleFromText("Clinique dentaire")).toBeNull();
    expect(runtimeLocaleFromText("")).toBeNull();
  });
});

describe("detectSiteLanguage", () => {
  it("takes what most pages say", () => {
    expect(detectSiteLanguage([{ language: "fr" }, { language: "en" }, { language: "fr-CA" }])).toBe("fr");
  });

  it("reads the text when no page names a language we speak", () => {
    const markdown = "Somos una clínica para usted y su familia, con servicios en la ciudad y sobre todo con los mejores precios para las empresas del barrio y los vecinos que nos visitan.";
    expect(detectSiteLanguage([{ language: "ja", markdown }])).toBe("es");
  });

  it("returns null when nothing settles it", () => {
    expect(detectSiteLanguage([])).toBeNull();
    expect(detectSiteLanguage([{ markdown: "Hello" }])).toBeNull();
  });
});
