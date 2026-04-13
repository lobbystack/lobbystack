import { chromium } from "playwright";

const USER_DATA_DIR = "/tmp/polar-playwright-profile";
const URL = process.argv[2] ?? "https://polar.sh/dashboard/noncia/products";

function uniq(values) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function summarizePresence(hasValue) {
  return hasValue ? "[present]" : "";
}

async function main() {
  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    viewport: { width: 1440, height: 980 },
  });
  const page = context.pages()[0] ?? (await context.newPage());

  try {
    console.log("goto", URL);
    await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(2500);

    const data = await page.evaluate(() => {
      const textOf = (selector) =>
        Array.from(document.querySelectorAll(selector))
          .map((node) => node.textContent ?? "")
          .map((text) => text.trim())
          .filter(Boolean);

      return {
        title: document.title,
        url: location.href,
        headings: textOf("h1, h2, h3"),
        buttons: textOf("button"),
        links: Array.from(document.querySelectorAll("a")).map((node) => ({
          text: (node.textContent ?? "").trim(),
          href: node.href,
        })),
        labels: textOf("label"),
        selects: Array.from(document.querySelectorAll("select")).map((node) => ({
          name: node.getAttribute("name"),
          value: node.value,
          options: Array.from(node.options).map((option) => ({
            value: option.value,
            text: option.textContent?.trim() ?? "",
          })),
        })),
        inputs: Array.from(document.querySelectorAll("input, textarea")).map((node) => ({
          tag: node.tagName,
          type: node.getAttribute("type"),
          name: node.getAttribute("name"),
          placeholder: node.getAttribute("placeholder"),
          hasValue: node.value.length > 0,
          ariaLabel: node.getAttribute("aria-label"),
        })),
      };
    });

    console.log(JSON.stringify({
      ...data,
      headings: uniq(data.headings),
      buttons: uniq(data.buttons),
      links: data.links.filter((link) => link.text || link.href).slice(0, 50),
      labels: uniq(data.labels),
      selects: data.selects,
      inputs: data.inputs.map((input) => ({
        ...input,
        value: summarizePresence(input.hasValue),
      })),
    }, null, 2));
  } finally {
    await context.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
