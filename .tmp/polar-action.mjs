import { chromium } from "playwright";

const USER_DATA_DIR = "/tmp/polar-playwright-profile";

function uniq(values) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function summarizePresence(hasValue) {
  return hasValue ? "[present]" : "";
}

async function dump(page, label) {
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

  console.log(
    JSON.stringify(
      {
        label,
        ...data,
        headings: uniq(data.headings),
        buttons: uniq(data.buttons),
        labels: uniq(data.labels),
        inputs: data.inputs.map((input) => ({
          ...input,
          value: summarizePresence(input.hasValue),
        })),
      },
      null,
      2,
    ),
  );
}

async function openContext() {
  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    viewport: { width: 1440, height: 980 },
  });
  const page = context.pages()[0] ?? (await context.newPage());
  return { context, page };
}

async function probeTokenModal() {
  const { context, page } = await openContext();
  try {
    await page.goto("https://polar.sh/dashboard/noncia/settings", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page.waitForTimeout(1500);
    await page.getByRole("button", { name: /create token/i }).click();
    await page.waitForTimeout(1000);
    await dump(page, "token-modal");
  } finally {
    await context.close();
  }
}

async function probeMeterEventPicker() {
  const { context, page } = await openContext();
  try {
    await page.goto("https://polar.sh/dashboard/noncia/products/meters/create", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page.waitForTimeout(1500);
    await page.getByRole("button", { name: /select event name/i }).click();
    await page.waitForTimeout(1000);
    await dump(page, "meter-event-picker");
  } finally {
    await context.close();
  }
}

async function probeBenefitTypePicker() {
  const { context, page } = await openContext();
  try {
    await page.goto("https://polar.sh/dashboard/noncia/products/benefits?create_benefit=true", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page.waitForTimeout(1500);
    await page.getByRole("button", { name: /feature flag/i }).click();
    await page.waitForTimeout(1000);
    await dump(page, "benefit-type-picker");
  } finally {
    await context.close();
  }
}

async function clickTextDump(url, text) {
  const { context, page } = await openContext();
  try {
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page.waitForTimeout(1500);
    await page.getByText(text, { exact: true }).first().click();
    await page.waitForTimeout(1000);
    await dump(page, `click:${text}`);
  } finally {
    await context.close();
  }
}

async function selectOptionDump(url, indexText, value) {
  const index = Number(indexText);
  const { context, page } = await openContext();
  try {
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page.waitForTimeout(1500);
    await page.locator("select").nth(index).selectOption(value);
    await page.waitForTimeout(1000);
    await dump(page, `select:${index}:${value}`);
  } finally {
    await context.close();
  }
}

const action = process.argv[2];

if (action === "probe-token-modal") {
  await probeTokenModal();
} else if (action === "probe-meter-event-picker") {
  await probeMeterEventPicker();
} else if (action === "probe-benefit-type-picker") {
  await probeBenefitTypePicker();
} else if (action === "click-text-dump") {
  const url = process.argv[3];
  const text = process.argv[4];
  if (!url || !text) {
    console.error("Usage: click-text-dump <url> <text>");
    process.exit(1);
  }
  await clickTextDump(url, text);
} else if (action === "select-option-dump") {
  const url = process.argv[3];
  const index = process.argv[4];
  const value = process.argv[5];
  if (!url || index === undefined || !value) {
    console.error("Usage: select-option-dump <url> <selectIndex> <value>");
    process.exit(1);
  }
  await selectOptionDump(url, index, value);
} else {
  console.error("Unknown action", action);
  process.exit(1);
}
