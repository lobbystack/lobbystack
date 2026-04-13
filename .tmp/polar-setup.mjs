import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { chromium } from "playwright";

const POLAR_URL = "https://polar.sh/dashboard/noncia";
const USER_DATA_DIR = "/tmp/polar-playwright-profile";

const rl = readline.createInterface({ input, output });

function maskSecret(value) {
  if (!value) {
    return "NOT_FOUND";
  }
  if (value.length <= 8) {
    return "[redacted]";
  }
  return `${value.slice(0, 4)}***${value.slice(-4)}`;
}

async function waitForEnter(prompt) {
  await rl.question(`${prompt}\nPress Enter here when you are ready to continue.`);
}

async function maybeClick(page, text) {
  const button = page.getByRole("button", { name: new RegExp(text, "i") });
  const link = page.getByRole("link", { name: new RegExp(text, "i") });

  if ((await button.count()) > 0) {
    await button.first().click();
    return true;
  }
  if ((await link.count()) > 0) {
    await link.first().click();
    return true;
  }
  return false;
}

async function maybeFill(page, label, value) {
  const locator = page.getByLabel(new RegExp(label, "i"));
  if ((await locator.count()) > 0) {
    await locator.first().fill(value);
    return true;
  }
  return false;
}

async function ensureLoggedIn(page) {
  await page.goto(POLAR_URL, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});

  const loginIndicators = [
    page.getByRole("button", { name: /sign in/i }),
    page.getByRole("button", { name: /continue with/i }),
    page.getByRole("link", { name: /sign in/i }),
    page.getByText(/log in|sign in to polar|continue with github/i),
  ];

  for (const locator of loginIndicators) {
    if ((await locator.count()) > 0) {
      console.log("LOGIN_REQUIRED");
      await waitForEnter("Polar needs you to log in in the browser window.");
      await page.goto(POLAR_URL, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle").catch(() => {});
      break;
    }
  }
}

async function ensureApiToken(page) {
  await page.goto("https://polar.sh/dashboard/noncia/settings", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});

  await maybeClick(page, "Developers");
  await maybeClick(page, "API");
  await page.waitForLoadState("networkidle").catch(() => {});

  const maskedToken = page.getByText(/op_[a-z0-9]{10,}/i);
  if ((await maskedToken.count()) > 0) {
    return (await maskedToken.first().textContent())?.trim() ?? null;
  }

  if (await maybeClick(page, "Create token")) {
    await maybeFill(page, "Name", "Convex Billing");
    await maybeClick(page, "^Create$");
    await page.waitForTimeout(1_500);
  }

  if ((await maskedToken.count()) > 0) {
    return (await maskedToken.first().textContent())?.trim() ?? null;
  }
  return null;
}

async function dumpPage(page, label) {
  console.log(`\n=== ${label} ===`);
  console.log("URL:", page.url());
  console.log("Title:", await page.title());
  console.log("Headings:", (await page.locator("h1, h2, h3").allTextContents()).slice(0, 12));
  console.log("Buttons:", (await page.getByRole("button").allTextContents()).slice(0, 20));
}

async function main() {
  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    viewport: { width: 1440, height: 980 },
  });
  const page = context.pages()[0] ?? (await context.newPage());

  try {
    await ensureLoggedIn(page);

    await page.goto("https://polar.sh/dashboard/noncia/products", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});
    await dumpPage(page, "Products");

    const token = await ensureApiToken(page);
    console.log("\nPOLAR_ORGANIZATION_TOKEN:", maskSecret(token));
    if (token) {
      console.log("Copy the full token directly from the Polar dashboard instead of terminal output.");
    }

    await waitForEnter("The browser session is ready for the next Polar setup step.");
  } finally {
    rl.close();
    await context.close();
  }
}

main().catch(async (error) => {
  console.error(error);
  rl.close();
  process.exit(1);
});
