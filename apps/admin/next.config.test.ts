import { readFileSync } from "node:fs";
import type { NextConfig } from "next";
import { afterEach, describe, expect, it, vi } from "vitest";

const withPostHogConfig = vi.hoisted(() => vi.fn((config: NextConfig, options: unknown) => ({ config, options })));
vi.mock("@posthog/nextjs-config", () => ({ withPostHogConfig }));

// What Railway hands a GitHub deploy's Docker build: the commit SHA as a build
// arg, next to a SERVICE_VERSION variable that stayed pinned to an old commit.
const RAILWAY_BUILD = {
  RAILWAY_GIT_COMMIT_SHA: "f7d94058ca01a771f293f9447b9e68f1a939b234",
  SERVICE_VERSION: "faac87ba",
  DEPLOYMENT_MODE: "",
  POSTHOG_SOURCEMAP_API_KEY: "phx_fixture",
};

async function loadConfig(env: Record<string, string>) {
  for (const name of ["RAILWAY_GIT_COMMIT_SHA", "RAILWAY_DEPLOYMENT_ID", "SERVICE_VERSION", "DEPLOYMENT_MODE", "POSTHOG_SOURCEMAP_API_KEY"]) vi.stubEnv(name, "");
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
  vi.resetModules();
  return (await import("./next.config")).default as unknown;
}

afterEach(() => {
  vi.unstubAllEnvs();
  withPostHogConfig.mockClear();
});

describe("admin build release", () => {
  it("uses the deployed commit for the bundle, the deployment ID, and the source map upload", async () => {
    const { config, options } = await loadConfig(RAILWAY_BUILD) as { config: NextConfig; options: { sourcemaps: { releaseVersion: string } } };
    expect(config.env?.NEXT_PUBLIC_SERVICE_VERSION).toBe(RAILWAY_BUILD.RAILWAY_GIT_COMMIT_SHA);
    expect(config.deploymentId).toBe(RAILWAY_BUILD.RAILWAY_GIT_COMMIT_SHA);
    expect(options.sourcemaps.releaseVersion).toBe(RAILWAY_BUILD.RAILWAY_GIT_COMMIT_SHA);
  });

  it("leaves the deployment ID unset for a local build without a release", async () => {
    const config = await loadConfig({}) as NextConfig;
    expect(withPostHogConfig).not.toHaveBeenCalled();
    expect(config.env?.NEXT_PUBLIC_SERVICE_VERSION).toBe("development");
    expect(config.deploymentId).toBeUndefined();
  });

  it("does not bake a deployment mode into the browser bundle", async () => {
    const { config } = await loadConfig({ ...RAILWAY_BUILD, DEPLOYMENT_MODE: "cloud" }) as { config: NextConfig };
    expect(config.env).not.toHaveProperty("NEXT_PUBLIC_DEPLOYMENT_MODE");
  });

  it("passes Railway's commit SHA into the Docker build that runs next build", () => {
    const buildStage = dockerBuildStage();
    const commitArg = buildStage.indexOf("ARG RAILWAY_GIT_COMMIT_SHA\n");
    expect(commitArg).toBeGreaterThan(-1);
    expect(commitArg).toBeLessThan(buildStage.indexOf("RUN pnpm --filter @lobbystack/admin... build"));
  });
});

const BRAND_LINK_VARIABLES = ["NEXT_PUBLIC_LANDING_SITE_URL", "NEXT_PUBLIC_TERMS_URL", "NEXT_PUBLIC_PRIVACY_URL", "NEXT_PUBLIC_DOCS_SITE_URL", "NEXT_PUBLIC_CONTACT_EMAIL"];

describe("admin build links", () => {
  it("writes the deployment's links into the build", async () => {
    const config = await loadConfig({
      NEXT_PUBLIC_LANDING_SITE_URL: "https://acme.example",
      NEXT_PUBLIC_TERMS_URL: "https://acme.example/legal/terms",
      NEXT_PUBLIC_PRIVACY_URL: "https://acme.example/legal/privacy",
      NEXT_PUBLIC_DOCS_SITE_URL: "https://acme.example",
      NEXT_PUBLIC_CONTACT_EMAIL: "support@acme.example",
    }) as NextConfig;
    expect(config.env).toMatchObject({
      NEXT_PUBLIC_LANDING_SITE_URL: "https://acme.example",
      NEXT_PUBLIC_TERMS_URL: "https://acme.example/legal/terms",
      NEXT_PUBLIC_PRIVACY_URL: "https://acme.example/legal/privacy",
      NEXT_PUBLIC_DOCS_SITE_URL: "https://acme.example",
      NEXT_PUBLIC_CONTACT_EMAIL: "support@acme.example",
    });
  });

  it("fixes unset links as empty, so a value added at run time can't split the server from the browser", async () => {
    for (const name of BRAND_LINK_VARIABLES) vi.stubEnv(name, undefined);
    const config = await loadConfig({}) as NextConfig;
    for (const name of BRAND_LINK_VARIABLES) expect(config.env?.[name]).toBe("");
  });

  it("passes the deployment's links to the Docker build that runs next build, with LobbyStack's as the default", () => {
    const buildStage = dockerBuildStage();
    const adminBuild = buildStage.indexOf("RUN pnpm --filter @lobbystack/admin... build");
    for (const name of BRAND_LINK_VARIABLES) {
      // No default value, so an image built without one links to LobbyStack's pages.
      const linkArg = buildStage.indexOf(`ARG ${name}\n`);
      expect(linkArg, name).toBeGreaterThan(-1);
      expect(linkArg, name).toBeLessThan(adminBuild);
    }
  });
});

function dockerBuildStage() {
  // A Windows checkout with core.autocrlf has CRLF line endings.
  const dockerfile = readFileSync(new URL("../../Dockerfile.admin", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  return dockerfile.slice(0, dockerfile.indexOf(" AS runtime"));
}

describe("development hosts", () => {
  it("lets partners' subdomains load development resources once partnerFeatures accepts the base domain", async () => {
    for (const name of ["ALLOWED_DEV_ORIGINS", "MARKETING_HOSTS"]) vi.stubEnv(name, "");
    expect((await loadConfig({ PARTNER_BASE_DOMAIN: " Partners.Localhost. " }) as NextConfig).allowedDevOrigins).toEqual(["*.partners.localhost"]);
    // A value partnerFeatures ignores adds nothing.
    for (const value of ["", "https://partners.localhost", "*.partners.localhost"]) {
      expect((await loadConfig({ PARTNER_BASE_DOMAIN: value }) as NextConfig).allowedDevOrigins, value).toEqual([]);
    }
  });
});

describe("moved routes", () => {
  it("sends the old widget settings address to the widget page", async () => {
    const config = await loadConfig({}) as NextConfig;
    expect(await config.redirects?.()).toContainEqual({ source: "/settings/widget", destination: "/widget", permanent: true });
  });

  it("sends the partner console's old Stripe page to Payments", async () => {
    const config = await loadConfig({}) as NextConfig;
    expect(await config.redirects?.()).toContainEqual({ source: "/partner/:partnerId/stripe", destination: "/partner/:partnerId/payments", permanent: true });
  });
});
