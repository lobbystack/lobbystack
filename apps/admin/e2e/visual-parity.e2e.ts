import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const baseURL = process.env.PARITY_BASE_URL;
const dynamic = { callId: process.env.PARITY_CALL_ID, contactId: process.env.PARITY_CONTACT_ID, demoToken: process.env.PARITY_DEMO_TOKEN, resetToken: process.env.PARITY_RESET_TOKEN };
type FixtureState = "public" | "onboarding" | "operator";
type DynamicKey = keyof typeof dynamic;
type VisualRoute = {
  path: string;
  harness?: string;
  referencePath?: string;
  expectedPath?: string;
  portExpectedPath?: string;
  snapshotId?: string;
  standalone?: boolean;
  fixtureState: FixtureState;
  state: string;
  comparison: "frozen-main" | "port-baseline" | "excluded";
  dynamicKey?: DynamicKey;
  forcedTheme?: "light" | "dark";
  interaction?: "viewer" | "auth-challenge-missing" | "dashboard-follow-up" | "auth-invalid-email" | "auth-password-criteria" | "auth-rejected" | "auth-account-exists" | "auth-submitting" | "import-cancel" | "import-failed-menu" | "import-queued" | "import-crawling" | "import-indexing" | "import-failed" | "billing-paid" | "billing-readonly" | "billing-incomplete" | "billing-transactions" | "demo-active" | "demo-preparing" | "demo-expired" | "demo-revoked" | "demo-claimed" | "claim-preparing" | "claim-invalid" | "claim-error" | "email-change-ready" | "email-change-success" | "email-change-error" | "reset-verify" | "reset-invalid-code" | "reset-invalid-password" | "upgrade-dialog" | "user-menu" | "recording-tab" | "number-empty" | "number-populated" | "number-more" | "add-text" | "add-website" | "add-upload" | "service-add" | "rule-add" | "feedback-empty" | "feedback-invalid" | "knowledge-indexed" | "knowledge-processing" | "knowledge-error";
  requiredFixture?: string;
  viewports?: Array<"desktop" | "mobile">;
};
type ParityManifest = { visualRoutes: VisualRoute[]; visualMatrix: { maxDiffPixelRatio: number; colorThreshold: number } };
const manifestPath = fileURLToPath(new URL("../../../docs/validation/admin-ui-parity.json", import.meta.url));
const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as ParityManifest;
const paritySide = process.env.PARITY_SIDE ?? "port";
const includePortBaselines = process.env.PARITY_INCLUDE_PORT_BASELINES === "1";

function resolveDynamicPath(path: string): string {
  return path.replace(/\[(callId|contactId|demoToken|resetToken)\]/g, (_, key: DynamicKey) => dynamic[key] ?? `[${key}]`);
}

const routes = manifest.visualRoutes
  .filter(route => !route.harness)
  .filter((routeCase) => routeCase.comparison === "frozen-main" || (includePortBaselines && paritySide !== "reference" && routeCase.comparison === "port-baseline"))
  .filter((routeCase) => !routeCase.requiredFixture || process.env[routeCase.requiredFixture] === "1")
  .filter((routeCase) => !routeCase.dynamicKey || Boolean(dynamic[routeCase.dynamicKey]))
  .map((routeCase) => ({
    ...routeCase,
    path: resolveDynamicPath(paritySide === "reference" ? routeCase.referencePath ?? routeCase.path : routeCase.path),
    snapshotId: routeCase.snapshotId ?? routeCase.path,
  }));
const viewports = [{ name: "desktop", width: 1440, height: 1000 }, { name: "mobile", width: 390, height: 844 }] as const;
const locales = ["en", "fr"] as const;
const themes = ["light", "dark"] as const;

for (const routeCase of routes) for (const viewport of viewports) for (const locale of locales) for (const theme of themes) {
  if (routeCase.viewports && !routeCase.viewports.includes(viewport.name)) continue;
  test(`${routeCase.fixtureState} ${routeCase.snapshotId} ${viewport.name} ${locale} ${theme}`, async ({ browser }) => {
    test.skip(!baseURL, "Set PARITY_BASE_URL to the frozen main or port server.");
    const fixturePrefix = `PARITY_${routeCase.fixtureState.toUpperCase()}`;
    const fixtureValue = (suffix: string) => process.env[`${fixturePrefix}_${suffix}_${locale.toUpperCase()}`] ?? process.env[`${fixturePrefix}_${suffix}`];
    const email = fixtureValue("LOGIN_EMAIL");
    const password = fixtureValue("LOGIN_PASSWORD");
    const login = routeCase.fixtureState !== "public" && email && password ? { email, password } : null;
    const storageState = routeCase.fixtureState !== "public" && !login ? fixtureValue("STORAGE_STATE") : undefined;
    const context = await browser.newContext({ viewport, locale, colorScheme: theme, timezoneId: "America/Toronto", ...(storageState ? { storageState } : {}) });
    try {
    if (routeCase.interaction === "viewer") {
      // Model equivalent read-only presentation without changing persisted fixture memberships.
      // Real mutation authorization is exercised by the database and operator browser suites.
      if (paritySide === "reference") {
        await context.routeWebSocket("**/sync", socket => {
          const server = socket.connectToServer(); const queries = new Map<number, string>();
          socket.onMessage(message => {
            const body = JSON.parse(message.toString());
            for (const modification of body.modifications ?? []) {
              if (modification.type === "Add") queries.set(modification.queryId, modification.udfPath);
              if (modification.type === "Remove") queries.delete(modification.queryId);
            }
            server.send(message);
          });
          server.onMessage(message => {
            const body = JSON.parse(message.toString());
            for (const modification of body.modifications ?? []) if (modification.type === "QueryUpdated") {
              if (queries.get(modification.queryId) === "businesses/admin:listForCurrentUser" && Array.isArray(modification.value)) {
                modification.value = modification.value.map((entry: { membership: Record<string, unknown> }) => ({ ...entry, membership: { ...entry.membership, role: "viewer" } }));
              }
              if (queries.get(modification.queryId) === "billing:getStatus" && modification.value) {
                Object.assign(modification.value, { hasBillingManagementAccess: false, hasCustomerPortalAccess: false, hasCheckoutAccess: false });
              }
            }
            socket.send(JSON.stringify(body));
          });
        });
      } else {
        await context.route("**/api/businesses", async route => {
          const response = await route.fetch(); const original = await response.json();
          await route.fulfill({ json: { ...original, businesses: original.businesses.map((business: Record<string, unknown>) => ({ ...business, role: "viewer" })) } });
        });
        await context.route("**/api/billing?*", async route => {
          const response = await route.fetch(); const original = await response.json();
          await route.fulfill({ json: { ...original, permissions: { hasBillingManagementAccess: false, hasCustomerPortalAccess: false, hasCheckoutAccess: false } } });
        });
      }
    }
    if (routeCase.interaction?.startsWith("auth-")) {
      if (paritySide === "reference") {
        await context.routeWebSocket("**/sync", socket => {
          const server = socket.connectToServer();
          socket.onMessage(message => {
            const body = JSON.parse(message.toString());
            if (body.type === "Action" && body.udfPath === "auth:signIn") {
              if (routeCase.interaction === "auth-submitting") return;
              socket.send(JSON.stringify({ type: "ActionResponse", requestId: body.requestId, success: false, result: routeCase.interaction === "auth-account-exists" ? "Account already exists" : "Invalid credentials", logLines: [] }));
            } else server.send(message);
          });
        });
      } else {
        await context.route("**/api/auth/sign-*/email", async route => {
          if (routeCase.interaction === "auth-submitting") return;
          await route.fulfill({ status: 400, json: { code: routeCase.interaction === "auth-account-exists" ? "USER_ALREADY_EXISTS" : "INVALID_EMAIL_OR_PASSWORD" } });
        });
      }
    }
    if (routeCase.interaction === "upgrade-dialog") {
      // This dialog is entered from a free workspace without a dedicated number.
      // Keep the fixture equivalent even when another scenario owns a test number.
      if (paritySide === "reference") {
        await context.routeWebSocket("**/sync", socket => {
          const server = socket.connectToServer();
          const queries = new Set<number>();
          socket.onMessage(message => {
            const body = JSON.parse(message.toString());
            for (const modification of body.modifications ?? []) {
              if (modification.type === "Add" && modification.udfPath === "businesses/catalog:getPrimaryPhoneNumber") queries.add(modification.queryId);
              if (modification.type === "Remove") queries.delete(modification.queryId);
            }
            server.send(message);
          });
          server.onMessage(message => {
            const body = JSON.parse(message.toString());
            for (const modification of body.modifications ?? []) if (modification.type === "QueryUpdated" && queries.has(modification.queryId)) modification.value = null;
            socket.send(JSON.stringify(body));
          });
        });
      } else {
        await context.route("**/api/phone-numbers?*", route => route.fulfill({ json: { phoneNumbers: [], activeClaim: null, replacement: { usedAt: null, activeClaim: null } } }));
      }
    }
    if (routeCase.interaction === "dashboard-follow-up") {
      const fixture = {
        actionRequired: [{ id: "parity-follow-up", kind: "voice_message", title: "Voice message from Alex", body: "Please call back.\nCallback: +14165550199\nUrgency: high", callId: "parity-call", createdAt: "2026-09-04T14:30:00Z" }],
        upcoming: [{ id: "parity-appointment", startsAt: "2026-09-07T14:30:00Z", timezone: "America/Toronto", status: "confirmed", sourceChannel: "voice", contactName: "Alex", serviceName: "Consultation", staffName: null }],
      };
      if (paritySide === "reference") {
        await context.routeWebSocket("**/sync", socket => {
          const server = socket.connectToServer(); const queries = new Set<number>();
          socket.onMessage(message => {
            const body = JSON.parse(message.toString());
            for (const modification of body.modifications ?? []) {
              if (modification.type === "Add" && modification.udfPath === "dashboard/overview:getHomeSummary") queries.add(modification.queryId);
              if (modification.type === "Remove") queries.delete(modification.queryId);
            }
            server.send(message);
          });
          server.onMessage(message => {
            const body = JSON.parse(message.toString());
            for (const modification of body.modifications ?? []) if (modification.type === "QueryUpdated" && queries.has(modification.queryId)) modification.value = { ...modification.value, ...fixture };
            socket.send(JSON.stringify(body));
          });
        });
      } else {
        await context.route("**/api/dashboard", async route => {
          const response = await route.fetch();
          await route.fulfill({ response, json: { ...await response.json(), ...fixture } });
        });
      }
    }
    if (routeCase.path === "/signup") {
      await context.route("https://challenges.cloudflare.com/**", async (request) => {
        await request.fulfill({
          contentType: "application/javascript",
          body: routeCase.interaction?.startsWith("auth-") && routeCase.interaction !== "auth-challenge-missing"
            ? "window.turnstile={ready:function(callback){callback()},render:function(element,options){setTimeout(function(){options.callback('parity-fixture-token')},0);return 'parity-widget'},remove:function(){},reset:function(){},execute:function(){}};setTimeout(function(){window.__lobbystackTurnstileLoaded&&window.__lobbystackTurnstileLoaded()},0);"
            : "window.turnstile={ready:function(callback){callback()},render:function(){return 'parity-widget'},remove:function(){},reset:function(){},execute:function(){}};setTimeout(function(){window.__lobbystackTurnstileLoaded&&window.__lobbystackTurnstileLoaded()},0);",
        });
      });
    }
    if (routeCase.interaction?.startsWith("import-")) {
      const status = routeCase.interaction === "import-cancel" ? "queued" : routeCase.interaction === "import-failed-menu" ? "failed" : routeCase.interaction.slice(7);
      const createdAt = "2026-09-04T12:00:00.000Z";
      const job = { _id: "parity-import-job", _creationTime: Date.parse(createdAt), status, websiteUrl: "https://www.example.invalid/help/", documentCount: 0, indexedDocumentCount: 0, errorDocumentCount: 0, pendingDocumentCount: 0, crawlFinishedCount: status === "crawling" ? 5 : status === "indexing" ? 10 : undefined, crawlTotalCount: ["crawling", "indexing"].includes(status) ? 10 : undefined };
      if (paritySide === "reference") {
        await context.routeWebSocket("**/sync", socket => {
          const server = socket.connectToServer(); const queryPaths = new Map<number, string>();
          socket.onMessage(message => {
            const body = JSON.parse(message.toString());
            for (const modification of body.modifications ?? []) {
              if (modification.type === "Add") queryPaths.set(modification.queryId, modification.udfPath);
              if (modification.type === "Remove") queryPaths.delete(modification.queryId);
            }
            server.send(message);
          });
          server.onMessage(message => {
            const body = JSON.parse(message.toString());
            for (const modification of body.modifications ?? []) if (modification.type === "QueryUpdated") {
              const path = queryPaths.get(modification.queryId);
              if (path === "ai/context/websiteIngestion:listWebsiteIngestionJobs") modification.value = [job];
              if (path === "ai/context/knowledge:listKnowledge") modification.value = { documents: [], snippets: [] };
            }
            socket.send(JSON.stringify(body));
          });
        });
      } else {
        await context.route("**/api/knowledge?*", route => route.fulfill({ json: { documents: [{ id: "parity-import-root", title: job.websiteUrl, sourceType: "website", sourceUrl: job.websiteUrl, active: true, status: status === "failed" ? "error" : "processing", textContent: "", processingProgress: 0, revision: 0, createdAt, updatedAt: createdAt, websiteImport: { id: job._id, status, websiteUrl: job.websiteUrl, importedCount: job.crawlTotalCount ?? 0, indexedCount: 0, documentCount: 0, crawlFinishedCount: job.crawlFinishedCount, crawlTotalCount: job.crawlTotalCount } }] } }));
        await context.route("**/api/knowledge/snippets?*", route => route.fulfill({ json: { snippets: [] } }));
      }
    }
    if (routeCase.interaction?.startsWith("billing-")) {
      const admin = routeCase.interaction !== "billing-readonly";
      const complete = routeCase.interaction !== "billing-incomplete";
      const transactions = routeCase.interaction === "billing-transactions" ? [
        { kind: "order", sourceId: "parity-order", status: "paid", amountCents: 12550, currency: "usd", description: "Pro subscription", invoiceUrl: "https://example.invalid/invoice", occurredAt: "2026-09-04T12:00:00.000Z" },
        { kind: "refund", sourceId: "parity-refund", status: "succeeded", amountCents: 1250, currency: "usd", description: "Usage credit", invoiceUrl: null, occurredAt: "2026-09-03T12:00:00.000Z" },
      ] : [];
      const permissions = { hasBillingManagementAccess: admin, hasCustomerPortalAccess: admin, hasCheckoutAccess: admin };
      if (paritySide === "reference") {
        await context.routeWebSocket("**/sync", socket => {
          const server = socket.connectToServer();
          const billingQueries = new Set<number>();
          socket.onMessage(message => {
            const body = JSON.parse(message.toString());
            for (const modification of body.modifications ?? []) {
              if (modification.type === "Add" && modification.udfPath === "billing:getStatus") billingQueries.add(modification.queryId);
              if (modification.type === "Remove") billingQueries.delete(modification.queryId);
            }
            server.send(message);
          });
          server.onMessage(message => {
            const body = JSON.parse(message.toString());
            for (const modification of body.modifications ?? []) {
              if (billingQueries.has(modification.queryId) && modification.type === "QueryUpdated") modification.value = {
                ...modification.value, ...permissions, plan: "pro", subscriptionState: "active", billingInterval: "monthly", monthlyChargeCents: 10000, activeAddons: [],
                availableCheckoutPlans: [], availableCheckoutIntervals: { starter: [], pro: [] },
                overageSpendingCapCents: 1250, overageSpendCents: 250, overageSpendCentsComplete: complete, overageSpendingCapReached: false,
                recentTransactions: transactions,
              };
            }
            socket.send(JSON.stringify(body));
          });
        });
      } else {
        await context.route("**/api/billing?*", async route => {
          const response = await route.fetch();
          const original = await response.json();
          await route.fulfill({ json: { ...original, permissions, availableCheckoutPlans: [], availableCheckoutIntervals: { starter: [], pro: [] },
            account: { ...original.account, plan: "pro", subscriptionState: "active", billingInterval: "monthly", overageSpendingCapCents: 1250 },
            usageStatus: { ...original.usageStatus, overageSpendCents: 250, usageComplete: complete, overageSpendingCapReached: false }, transactions,
          } });
        });
      }
    }
    if (routeCase.interaction?.startsWith("claim-") || routeCase.interaction?.startsWith("demo-")) {
      const preview = { state: routeCase.interaction.startsWith("demo-") ? routeCase.interaction.slice(5) : routeCase.interaction === "claim-preparing" ? "preparing" : routeCase.interaction === "claim-invalid" ? "invalid" : "active", demoId: "parity-demo", businessName: "Acme Dental", businessSlug: "acme-dental", locale, websiteUrl: "https://example.invalid", suggestedPrompts: ["What are your opening hours?", "Can I book a consultation?"], signupPath: "/signup?returnTo=%2Fclaim-demo", expiresAt: Date.now() + 60000, campaignId: null };
      if (paritySide === "reference") {
        await context.routeWebSocket("**/sync", socket => {
          const server = socket.connectToServer();
          const previewQueries = new Set<number>();
          socket.onMessage(message => {
            const body = JSON.parse(message.toString());
            for (const modification of body.modifications ?? []) {
              if (modification.type === "Add" && modification.udfPath === "demos:previewProspectDemo") previewQueries.add(modification.queryId);
              if (modification.type === "Remove") previewQueries.delete(modification.queryId);
            }
            if (body.type === "Mutation" && body.udfPath === "demos:claimProspectDemo") {
              socket.send(JSON.stringify({ type: "MutationResponse", requestId: body.requestId, success: false, result: "Temporary claim failure", logLines: [] }));
            } else server.send(message);
          });
          server.onMessage(message => {
            const body = JSON.parse(message.toString());
            for (const modification of body.modifications ?? []) {
              if (previewQueries.has(modification.queryId) && modification.type === "QueryUpdated") modification.value = preview;
            }
            socket.send(JSON.stringify(body));
          });
        });
      } else {
        await context.route("**/api/demo/preview", route => route.fulfill({ json: preview }));
        await context.route("**/api/demo/claim", route => route.fulfill({ status: 503, json: { error: "Temporary claim failure" } }));
      }
    }
    if (routeCase.interaction?.startsWith("number-")) {
      const inventory = (limit: number) => Array.from({ length: routeCase.interaction === "number-empty" ? 0 : limit }, (_, index) => ({ e164: `+14165550${String(index).padStart(3, "0")}`, display: `(416) 555-0${String(index).padStart(3, "0")}`, locality: "Toronto", region: "ON", countryCode: "CA", kind: "local", capabilities: { sms: true, voice: true }, selectionContext: { mode: "suggested", countryCode: "CA" }, claimToken: `parity-inventory-${index}` }));
      if (paritySide === "reference") {
        await context.routeWebSocket("**/sync", socket => {
          const server = socket.connectToServer();
          socket.onMessage(message => {
            const body = JSON.parse(message.toString()) as { type: string; udfPath?: string; requestId?: number; args?: Array<{ limit?: number }> };
            const initial = body.udfPath?.endsWith(":getInitialNumberSuggestion") || body.udfPath?.endsWith(":getInitialReplacementNumberSuggestion");
            const search = body.udfPath?.endsWith(":searchAvailableNumbers") || body.udfPath?.endsWith(":searchReplacementNumbers");
            if (body.type === "Action" && (initial || search)) {
              const numbers = inventory(initial ? 10 : body.args?.[0]?.limit ?? 10);
              const result = initial ? { market: { countryCode: "CA", areaCode: "416", city: "Toronto" }, suggestion: numbers[0], alternatives: numbers.slice(1) } : { market: { countryCode: "CA", areaCode: "416", city: "Toronto" }, selectionContext: { mode: "suggested", countryCode: "CA" }, numbers };
              socket.send(JSON.stringify({ type: "ActionResponse", requestId: body.requestId, success: true, result, logLines: [] }));
            } else server.send(message);
          });
        });
      } else {
        await context.route("**/api/onboarding/phone-numbers/suggestion?*", route => route.fulfill({ json: { market: { countryCode: "CA", areaCode: "416", city: "Toronto" }, numbers: inventory(10).map(number => ({ ...number, phoneE164: number.e164 })) } }));
        await context.route("**/api/onboarding/phone-numbers/search?*", route => route.fulfill({ json: { market: { countryCode: "CA", areaCode: "416", city: "Toronto" }, numbers: inventory((route.request().postDataJSON() as { limit: number }).limit).map(number => ({ ...number, phoneE164: number.e164 })) } }));
      }
    }
    if (routeCase.interaction?.startsWith("reset-")) {
      // Deterministic service responses exercise the original form, not a reconstructed UI.
      // Actual reset-code authorization/expiry is certified separately against PostgreSQL.
      if (paritySide === "reference") {
        await context.routeWebSocket("**/sync", socket => {
          const server = socket.connectToServer();
          socket.onMessage(message => {
            const body = JSON.parse(message.toString()) as { type: string; udfPath?: string; requestId?: number; args?: Array<{ params?: { flow?: string } }> };
            if (body.type === "Action" && body.udfPath === "auth:signIn" && body.args?.[0]?.params?.flow?.startsWith("reset")) {
              const verify = body.args[0].params.flow === "reset-verification";
              socket.send(JSON.stringify({ type: "ActionResponse", requestId: body.requestId, success: !verify, result: verify ? (routeCase.interaction === "reset-invalid-password" ? "Invalid password" : "Invalid code") : {}, logLines: [] }));
            } else server.send(message);
          });
        });
      } else {
        await context.route("**/api/auth/email-otp/request-password-reset", route => route.fulfill({ json: { success: true } }));
        await context.route("**/api/auth/email-otp/reset-password", route => route.fulfill({ status: 400, json: { code: routeCase.interaction === "reset-invalid-password" ? "INVALID_PASSWORD" : "INVALID_OTP" } }));
      }
    }
    if (routeCase.interaction?.startsWith("email-change-")) {
      if (paritySide === "reference") {
        await context.routeWebSocket("**/sync", socket => {
          const server = socket.connectToServer();
          socket.onMessage(message => {
            const body = JSON.parse(message.toString()) as { type: string; udfPath?: string; requestId?: number };
            if (body.type === "Action" && body.udfPath?.endsWith(":confirmEmailChange")) {
              const success = routeCase.interaction === "email-change-success";
              socket.send(JSON.stringify({ type: "ActionResponse", requestId: body.requestId, success, result: success ? { email: "new-email@example.invalid" } : "Invalid confirmation", logLines: [] }));
            } else server.send(message);
          });
        });
      } else {
        await context.route("**/api/auth/verify-email?*", route => route.fulfill({ status: routeCase.interaction === "email-change-success" ? 200 : 401, json: routeCase.interaction === "email-change-success" ? { status: true, user: { email: "new-email@example.invalid" } } : { error: "Invalid token" } }));
      }
    }
    const page = await context.newPage();
    if (routeCase.interaction === "demo-active") await page.addInitScript(() => {
      // Freeze the original procedural animation identically on both sides; do not mask the canvas.
      Math.random = () => 0.5;
      const originalAnimationFrame = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = callback => originalAnimationFrame(() => callback(0));
    });
    await page.addInitScript(({ locale, theme }) => { localStorage.setItem("lobbystack.locale", locale); localStorage.setItem("theme", theme); document.documentElement?.classList.toggle("dark", theme === "dark"); }, { locale, theme });
    if (login) {
      await page.goto(new URL("/login", baseURL!).toString(), { waitUntil: "domcontentloaded" });
      await page.locator('input[type="email"]').fill(login.email);
      await page.locator('input[type="password"]').fill(login.password);
      await page.locator('button[type="submit"]').click();
      await page.waitForURL((url) => url.pathname !== "/login", { timeout: 20_000 });
    }
    await page.goto(new URL(routeCase.path, baseURL!).toString(), { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("load");
    await page.waitForTimeout(routeCase.path === "/analytics" ? 3000 : 1500);
    // Disable CSS transitions before interactions so loading-state opacity is never captured mid-transition.
    await page.addStyleTag({ content: "*,*::before,*::after{animation-duration:0s!important;transition-duration:0s!important;caret-color:transparent!important}" });
    await expect.poll(() => new URL(page.url()).pathname, { message: `The fixture must render the requested route or its documented redirect: ${routeCase.path}` }).toBe(new URL(resolveDynamicPath((paritySide === "port" ? routeCase.portExpectedPath : undefined) ?? routeCase.expectedPath ?? routeCase.path), baseURL!).pathname);
    await expect.poll(() => page.evaluate(() => localStorage.getItem("lobbystack.locale")), { message: "Rendered fixture locale must match the matrix case; use a separate persisted user per locale." }).toBe(locale);
    await expect.poll(() => page.locator("html").evaluate((element) => element.classList.contains("dark"))).toBe((routeCase.forcedTheme ?? theme) === "dark");
    if (routeCase.interaction?.startsWith("auth-")) {
      const auth = JSON.parse(readFileSync(fileURLToPath(new URL(`../public/locales/${locale}/auth.json`, import.meta.url)), "utf8"));
      const mode = routeCase.path === "/login" ? "login" : "signup";
      await page.locator('input[type="email"]').fill(routeCase.interaction === "auth-invalid-email" ? "invalid-email" : "parity-auth-state@example.invalid");
      if (routeCase.interaction === "auth-invalid-email") {
        await page.locator('input[type="password"]').focus();
        await expect(page.getByText(auth[mode].emailInvalid, { exact: true })).toBeVisible();
      } else {
        await page.locator('input[type="password"]').fill(routeCase.interaction === "auth-password-criteria" ? "short" : "Valid-Password-123!");
        if (routeCase.interaction === "auth-password-criteria") {
          await expect(page.getByText(auth.signup.passwordCriteria.minimumLength, { exact: true })).toBeVisible();
        } else {
          await page.locator('button[type="submit"]').click();
          if (routeCase.interaction === "auth-submitting") await expect(page.getByRole("button", { name: auth[mode].submitting })).toBeVisible();
          else await expect(page.getByText(routeCase.interaction === "auth-challenge-missing" ? auth.errors.turnstileRequired : routeCase.interaction === "auth-account-exists" ? auth.errors.accountExists : auth.errors.incorrectCredentials, { exact: true })).toBeVisible();
        }
      }
    }
    if (routeCase.fixtureState === "operator" && !routeCase.standalone && viewport.name === "desktop" && process.env.PARITY_SETUP_GUIDE_EXPECTED === "1") {
      const nav = JSON.parse(readFileSync(fileURLToPath(new URL(`../public/locales/${locale}/nav.json`, import.meta.url)), "utf8"));
      await expect(page.getByRole("button", { name: nav.sidebar.setupGuide.open, exact: true })).toBeVisible();
    }
    if (routeCase.interaction?.startsWith("claim-")) {
      const translations = JSON.parse(readFileSync(fileURLToPath(new URL(`../public/locales/${locale}/demos.json`, import.meta.url)), "utf8"));
      await expect(page.getByRole("heading", { name: translations.claim[routeCase.interaction === "claim-preparing" ? "loadingTitle" : routeCase.interaction === "claim-invalid" ? "unavailableTitle" : "errorTitle"], exact: true })).toBeVisible();
    }
    if (routeCase.interaction?.startsWith("demo-")) {
      const translations = JSON.parse(readFileSync(fileURLToPath(new URL(`../public/locales/${locale}/demos.json`, import.meta.url)), "utf8"));
      const state = routeCase.interaction.slice(5);
      const title = (state === "active" ? translations.active.title : translations.states[state].titleWithBusiness).replace("{{businessName}}", "Acme Dental");
      await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
    }
    if (routeCase.path === "/analytics") await expect(page.getByRole("application")).toHaveCount(5);
    const authHeadingKeys: Record<string, string> = { "/login": "login", "/signup": "signup", "/forgot-password": "forgotPassword", "/confirm-email-change": "confirmEmailChange", "/accept-invite": "acceptInvite" };
    const headingKey = authHeadingKeys[routeCase.path];
    if (headingKey) {
      const translations = JSON.parse(readFileSync(fileURLToPath(new URL(`../public/locales/${locale}/auth.json`, import.meta.url)), "utf8"));
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(translations[headingKey].title);
    }
    if (routeCase.interaction?.startsWith("number-")) {
      const onboarding = JSON.parse(readFileSync(fileURLToPath(new URL(`../public/locales/${locale}/onboarding.json`, import.meta.url)), "utf8"));
      await expect(page.locator("#number-area-code")).toHaveValue("416");
      if (routeCase.interaction === "number-empty") await expect(page.getByText(onboarding.number.empty, { exact: true })).toBeVisible();
      else await expect(page.getByText("(416) 555-0000", { exact: true })).toBeVisible();
      if (routeCase.interaction === "number-more") {
        await page.getByRole("button", { name: onboarding.number.loadMore, exact: true }).click();
        await expect(page.getByRole("button", { name: onboarding.number.select, exact: true })).toHaveCount(20);
      }
    }
    if (routeCase.interaction?.startsWith("reset-")) {
      const auth = JSON.parse(readFileSync(fileURLToPath(new URL(`../public/locales/${locale}/auth.json`, import.meta.url)), "utf8"));
      await page.getByLabel(auth.forgotPassword.email, { exact: true }).fill("parity-recovery@example.invalid");
      await page.getByRole("button", { name: auth.forgotPassword.submit, exact: true }).click();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(auth.forgotPassword.verifyTitle);
      if (routeCase.interaction !== "reset-verify") {
        await page.getByLabel(auth.forgotPassword.code, { exact: true }).fill("123456");
        await page.getByLabel(auth.forgotPassword.newPassword, { exact: true }).fill(routeCase.interaction === "reset-invalid-password" ? "weakpassword" : "Recovery-Password-123!");
        await page.getByRole("button", { name: auth.forgotPassword.verifySubmit, exact: true }).click();
        await expect(page.getByText(routeCase.interaction === "reset-invalid-password" ? auth.errors.invalidPassword : auth.errors.invalidResetCode, { exact: true })).toBeVisible();
      }
      await page.getByRole("heading", { level: 1 }).click();
    }
    if (routeCase.interaction?.startsWith("email-change-") && routeCase.interaction !== "email-change-ready") {
      const auth = JSON.parse(readFileSync(fileURLToPath(new URL(`../public/locales/${locale}/auth.json`, import.meta.url)), "utf8"));
      await page.getByRole("button", { name: auth.confirmEmailChange.submit, exact: true }).click();
      await expect(page.getByText(routeCase.interaction === "email-change-success" ? auth.confirmEmailChange.success.replace("{{email}}", "new-email@example.invalid") : auth.confirmEmailChange.invalidLink, { exact: true })).toBeVisible();
      await page.getByRole("heading", { level: 1 }).click();
    }
    if (routeCase.interaction === "upgrade-dialog") {
      const settings = JSON.parse(readFileSync(fileURLToPath(new URL(`../public/locales/${locale}/settings.json`, import.meta.url)), "utf8"));
      await page.getByRole("button", { name: settings.phoneNumber.requiresPaidPlan.upgradeCta, exact: true }).click();
      await expect(page.getByRole("dialog").getByRole("heading", { level: 3 })).toHaveCount(4);
    }
    if (routeCase.interaction === "user-menu") {
      if (viewport.name === "mobile") await page.getByRole("button", { name: "Toggle sidebar", exact: true }).click();
      await page.locator('[data-slot="sidebar-footer"]').getByRole("button", { name: /@/ }).click();
      await expect(page.getByRole("menu")).toBeVisible();
    }
    if (routeCase.interaction === "recording-tab") {
      const calls = JSON.parse(readFileSync(fileURLToPath(new URL(`../public/locales/${locale}/calls.json`, import.meta.url)), "utf8"));
      await page.getByRole("tab", { name: calls.detail.tabs.recording, exact: true }).click();
      await expect(page.getByText(calls.detail.recording.unavailable, { exact: true })).toBeVisible();
    }
    if (routeCase.interaction === "service-add" || routeCase.interaction === "rule-add") {
      const agent = JSON.parse(readFileSync(fileURLToPath(new URL(`../public/locales/${locale}/agent.json`, import.meta.url)), "utf8"));
      const section = routeCase.interaction === "service-add" ? agent.sections.services : agent.sections.rules;
      await page.getByRole("button", { name: section.addKnowledge, exact: true }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await expect(page.getByRole("dialog").getByRole("button", { name: agent.actions.save, exact: true })).toBeEnabled();
    }
    if (routeCase.interaction?.startsWith("add-")) {
      const agent = JSON.parse(readFileSync(fileURLToPath(new URL(`../public/locales/${locale}/agent.json`, import.meta.url)), "utf8"));
      const kind = routeCase.interaction.slice(4);
      await page.getByRole("button", { name: agent.sections.knowledge.addKnowledge, exact: true }).click();
      await page.getByRole("menuitem", { name: agent.sections.knowledge.addKnowledgeOptions[kind], exact: true }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await expect(page.getByRole("dialog").getByRole("button", { name: kind === "website" ? agent.sections.knowledge.websiteImport.submit : agent.actions.save, exact: true })).toBeEnabled();
    }
    if (routeCase.interaction?.startsWith("import-")) {
      await expect(page.getByText("example.invalid/help", { exact: true })).toBeVisible();
      if (!routeCase.interaction.startsWith("import-failed")) await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", ["import-queued", "import-cancel"].includes(routeCase.interaction) ? "8" : routeCase.interaction === "import-crawling" ? "50" : "99");
      if (["import-cancel", "import-failed-menu"].includes(routeCase.interaction)) {
        const agent = JSON.parse(readFileSync(fileURLToPath(new URL(`../public/locales/${locale}/agent.json`, import.meta.url)), "utf8"));
        await page.getByRole("button", { name: agent.actions.moreOptions, exact: true }).click();
        await expect(page.getByRole("menu")).toBeVisible();
        if (routeCase.interaction === "import-cancel") {
          await page.getByRole("menuitem", { name: agent.actions.cancelImport, exact: true }).click();
          await expect(page.getByRole("alertdialog")).toBeVisible();
        }
      }
    }
    if (routeCase.interaction?.startsWith("knowledge-")) {
      const title = routeCase.interaction === "knowledge-indexed" ? "Clinic hours" : routeCase.interaction === "knowledge-processing" ? "Pending policy" : "Failed policy";
      await page.getByText(title, { exact: true }).click();
      const preview = page.locator("textarea[readonly]");
      const agent = JSON.parse(readFileSync(fileURLToPath(new URL(`../public/locales/${locale}/agent.json`, import.meta.url)), "utf8"));
      await expect(preview).toHaveValue(routeCase.interaction === "knowledge-indexed" ? "Our clinic is open Monday to Friday, 9 AM to 5 PM." : routeCase.interaction === "knowledge-error" ? "Could not extract readable text." : agent.sections.knowledge.previewPending);
    }
    if (routeCase.interaction?.startsWith("feedback-")) {
      const common = JSON.parse(readFileSync(fileURLToPath(new URL(`../public/locales/${locale}/common.json`, import.meta.url)), "utf8"));
      await page.getByRole("button", { name: common.feedback.trigger, exact: true }).click();
      const message = page.getByRole("textbox", { name: common.feedback.label, exact: true });
      await expect(message).toBeVisible();
      if (routeCase.interaction === "feedback-invalid") {
        await message.fill("i".repeat(2001));
        await expect(message).toHaveAttribute("aria-invalid", "true");
      }
      await expect(page.getByRole("button", { name: common.feedback.submit, exact: true })).toBeDisabled();
      // Filling an auto-sizing textarea can scroll the document to its caret.
      // Capture the same viewport origin on both runtimes, after repositioning.
      await page.evaluate(async () => {
        window.scrollTo(0, 0);
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      });
    }
    if (routeCase.interaction === "dashboard-follow-up") {
      await expect(page.getByRole("link", { name: /Please call back.*Alex/ })).toHaveAttribute("href", "/calls/parity-call");
      await expect(page.getByText("+14165550199", { exact: true })).toBeVisible();
    }
    await page.addStyleTag({ content: "*,*::before,*::after{animation-duration:0s!important;transition-duration:0s!important;caret-color:transparent!important}" });
    await page.evaluate(async () => { await document.fonts.ready; });
    const name = `${routeCase.snapshotId === "/" ? "home" : routeCase.snapshotId.replace(/^\//, "").replace(/[/?=&\[\]]+/g, "-")}-${viewport.name}-${locale}-${theme}.png`;
    let accessibleTree = await page.locator("body").ariaSnapshot();
    // Normalize only Next's framework-owned route announcement. Application
    // alerts remain compared, including nonempty validation and error messages.
    const announcer = page.locator("next-route-announcer").getByRole("alert");
    if (await announcer.count() === 1) {
      const announcement = await announcer.ariaSnapshot();
      if (accessibleTree.startsWith(`${announcement}\n`)) accessibleTree = accessibleTree.slice(announcement.length + 1);
    }
    // Architecture-specific primary keys differ in equivalent seeded fixtures.
    // Normalize URL targets only; visible text is never rewritten.
    accessibleTree = accessibleTree.split("\n").map((line) => {
      if (!/^\s*-?\s*\/url:/.test(line)) return line;
      for (const key of ["callId", "contactId"] as const) {
        if (dynamic[key]) line = line.replaceAll(dynamic[key], `[${key}]`);
      }
      return line;
    }).join("\n");
    expect.soft(accessibleTree).toMatchSnapshot(name.replace(/\.png$/, ".aria.yml"));
    await page.screenshot({ path: test.info().outputPath(name.replace(/\.png$/, "-rendered.png")), fullPage: true, animations: "disabled" });
    await expect(page).toHaveScreenshot(name, { fullPage: true, threshold: manifest.visualMatrix.colorThreshold, maxDiffPixelRatio: manifest.visualMatrix.maxDiffPixelRatio, animations: "disabled" });
    } finally {
      await context.close();
    }
  });
}
