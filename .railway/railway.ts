// LobbyStack platform infrastructure (staging and production). Secrets remain in Railway via preserve().
import { bucket, database, defineRailway, github, image, preserve, project, service, volume } from "railway/iac";

export default defineRailway((ctx) => {
  if (ctx.projectId !== "af0a130e-7b02-4fc0-94ef-b0ac45a0a0a6" || !["staging", "production"].includes(ctx.environment)) {
    throw new Error("This infrastructure definition manages only the lobbystack staging or production environment.");
  }
  const production = ctx.environment === "production";
  // CI moves `production` to each main commit after its checks and migrations
  // pass. Waiting on GitHub checks here also waited on Dependabot's jobs, and a
  // failed one made Railway skip the release.
  const productionSource = production ? github("lobbystack/lobbystack", { branch: "production", checkSuites: false }) : undefined;
  const stagingAdminUrl = "https://admin-staging-7e92.up.railway.app";
  // Watch paths (gitignore-style, anchored at the repo root) so a service only
  // redeploys when its app, shared workspace packages, or build inputs change.
  const sharedWatchPatterns = ["/package.json", "/pnpm-lock.yaml", "/pnpm-workspace.yaml", "/.npmrc", "/tsconfig.base.json", "/packages/**"];
  // The migrator only builds `@lobbystack/db` plus its workspace dependencies
  // (contracts, telemetry). Watching those instead of every package keeps
  // unrelated changes from rebuilding and redeploying a migration run-once job.
  const migratorWatchPatterns = ["/package.json", "/pnpm-lock.yaml", "/pnpm-workspace.yaml", "/.npmrc", "/tsconfig.base.json", "/packages/db/**", "/packages/contracts/**", "/packages/telemetry/**", "/Dockerfile.migrator"];
  const observability = {
    OTEL_EXPORTER_OTLP_ENDPOINT: preserve(),
    OTEL_EXPORTER_OTLP_HEADERS: preserve(),
    SERVICE_VERSION: preserve(),
  };
  // AI cost-reporting rates read by packages/agent-core; set only in production.
  const aiChatPricing = production ? {
    AI_CHAT_CACHED_INPUT_COST_PER_MILLION_TOKENS: preserve(),
    AI_CHAT_INPUT_COST_PER_MILLION_TOKENS: preserve(),
    AI_CHAT_OUTPUT_COST_PER_MILLION_TOKENS: preserve(),
    AI_CHAT_PRICING_EFFECTIVE_DATE: preserve(),
    AI_CHAT_PRICING_SOURCE: preserve(),
    AI_CHAT_PRICING_VERSION: preserve(),
  } : {};
  const Redis = database(production ? "Redis-production" : "Redis", "redis", { image: "redis:7-alpine", region: "us-east4-eqdc4a", defaultMountPath: "/data" });
  Redis.deploy = { startCommand: "sh -c 'exec redis-server --bind :: 0.0.0.0 --appendonly yes --maxmemory-policy noeviction --requirepass \"$REDIS_PASSWORD\"'", ...(production ? {} : { sleepApplication: true }) };
  Redis.networking = { privateNetworkEndpoint: "redis" };
  const postgresVolume = volume(production ? "postgres-volume-production" : "postgres-volume", { alerts: { usage: { "100": {}, "80": {}, "95": {} } }, allowOnlineResize: true, region: "us-east4-eqdc4a", sizeMB: 5000 });
  // Staging's existing database-owned volume already matches this resource name.
  // Production owns `redis-production-volume`; declaring another volume there
  // would create an unattached duplicate named `redis-volume-production`.
  const redisVolumes = production
    ? []
    : [volume("redis-volume", { alerts: { usage: { "100": {}, "80": {}, "95": {} } }, allowOnlineResize: true, region: "us-east4-eqdc4a", sizeMB: 5000 })];
  Redis.variables = { REDIS_PASSWORD: preserve() };
  // The database product owns its existing /data mount. Keep the staging volume
  // resource in the project, but do not manage either environment's attachment
  // here because that causes perpetual CLI drift.
  const parityCertification = bucket(production ? "lobbystack-production" : "parity-certification", { region: "iad" });
  const worker = service("worker", {
    source: productionSource,
    build: { buildEnvironment: "V3", builder: "DOCKERFILE", dockerfilePath: "Dockerfile.worker", watchPatterns: [...sharedWatchPatterns, "/apps/worker/**", "/Dockerfile.worker"] },
    healthcheck: "/health/ready",
    healthcheckTimeout: 300,
    preDeploy: [],
    replicas: { "us-east4-eqdc4a": 1 },
    deploy: { restartPolicyMaxRetries: 3, ...(production ? {} : { sleepApplication: true }) },
    env: {
      ...observability,
      ...aiChatPricing,
      APP_BASE_URL: preserve(),
      DATABASE_URL: preserve(),
      DEPLOYMENT_MODE: preserve(),
      ENCRYPTION_KEY: preserve(),
      LOBBYSTACK_DISPATCHER_DATABASE_URL: preserve(),
      LOBBYSTACK_WORKER_DATABASE_URL: preserve(),
      OPENAI_API_KEY: preserve(),
      EMAIL_FROM: preserve(),
      // GPT-Live calls: the admin hands each call to the worker with this token.
      INTERNAL_SERVICE_TOKEN: preserve(),
      LIVE_PROTOTYPE_ENABLED: "true",
      // Railway sends SIGKILL this long after SIGTERM, and the worker drains its
      // calls for this long minus a margin, so a 30-minute call finishes during
      // a deploy. See "Deploy the worker during calls" in docs/voice/runtime.md.
      // Staging keeps its own shorter drain, set in the dashboard.
      RAILWAY_DEPLOYMENT_DRAINING_SECONDS: production ? "1860" : preserve(),
      // New phone numbers join this Twilio Elastic SIP trunk, which sends their
      // calls to GPT-Live. Provisioning fails without it.
      TWILIO_SIP_TRUNK_SID: preserve(),
      FEEDBACK_TO_EMAIL: preserve(),
      ONBOARDING_FOLLOWUP_FROM: preserve(),
      ONBOARDING_FOLLOWUP_SENDER_NAME: preserve(),
      FIRECRAWL_API_KEY: preserve(),
      GOOGLE_CLIENT_ID: preserve(),
      GOOGLE_CLIENT_SECRET: preserve(),
      GOOGLE_REDIRECT_URI: preserve(),
      POLAR_ACCESS_TOKEN: preserve(),
      POLAR_ORGANIZATION_ID: preserve(),
      POLAR_API_BASE_URL: preserve(),
      POLAR_STARTER_MONTHLY_PRODUCT_ID: preserve(),
      POLAR_STARTER_ANNUAL_PRODUCT_ID: preserve(),
      POLAR_PRO_MONTHLY_PRODUCT_ID: preserve(),
      POLAR_PRO_ANNUAL_PRODUCT_ID: preserve(),
      POSTHOG_API_KEY: preserve(),
      POSTHOG_HOST: preserve(),
      SMTP_HOST: preserve(),
      SMTP_PORT: preserve(),
      SMTP_SECURE: preserve(),
      SMTP_USERNAME: preserve(),
      SMTP_PASSWORD: preserve(),
      TWILIO_ACCOUNT_SID: preserve(),
      TWILIO_AUTH_TOKEN: preserve(),
      TWILIO_ALERT_ACCOUNT_SID: preserve(),
      TWILIO_ALERT_SMS_FROM: preserve(),
      TWILIO_ALERT_API_KEY_SID: preserve(),
      TWILIO_ALERT_API_KEY_SECRET: preserve(),
      TWILIO_STATUS_CALLBACK_URL: production ? preserve() : `${stagingAdminUrl}/api/webhooks/twilio/status`,
      NODE_ENV: "production",
      OTP_HASH_SECRET: preserve(),
      PORT: preserve(),
      REDIS_PREFIX: preserve(),
      REDIS_URL: preserve(),
      S3_ACCESS_KEY_ID: preserve(),
      S3_BUCKET: preserve(),
      S3_ENDPOINT: preserve(),
      S3_FORCE_PATH_STYLE: preserve(),
      S3_REGION: preserve(),
      S3_SECRET_ACCESS_KEY: preserve(),
      STORAGE_PROVIDER: preserve(),
      ...(production ? { LOBBYSTACK_MAINTENANCE_MODE: preserve() } : {}),
    },
  });
  const admin = service("admin", {
    source: productionSource,
    build: { buildEnvironment: "V3", builder: "DOCKERFILE", dockerfilePath: "Dockerfile.admin", watchPatterns: [...sharedWatchPatterns, "/apps/admin/**", "/scripts/copy-widget-embed.mjs", "/Dockerfile.admin"] },
    healthcheck: "/api/health/ready",
    healthcheckTimeout: 300,
    replicas: { "us-east4-eqdc4a": 1 },
    // Serverless (app sleeping): preserve the staging setting; production stays always-on.
    deploy: { restartPolicyMaxRetries: 3, ...(production ? {} : { sleepApplication: true }) },
    env: {
      ...observability,
      ...aiChatPricing,
      APP_BASE_URL: preserve(),
      AUTH_TRUSTED_ORIGINS: preserve(),
      BETTER_AUTH_SECRET: preserve(),
      BETTER_AUTH_USE_SECURE_COOKIES: preserve(),
      DASHBOARD_TEST_CALL_TOKEN: preserve(),
      DATABASE_URL: preserve(),
      DEPLOYMENT_MODE: preserve(),
      ENCRYPTION_KEY: preserve(),
      GOOGLE_REDIRECT_URI: preserve(),
      GOOGLE_CLIENT_ID: preserve(),
      GOOGLE_CLIENT_SECRET: preserve(),
      FEEDBACK_TO_EMAIL: preserve(),
      HOSTNAME: preserve(),
      INTERNAL_SERVICE_SECRET: preserve(),
      INTERNAL_SERVICE_TOKEN: preserve(),
      LOBBYSTACK_APP_DATABASE_URL: preserve(),
      LOBBYSTACK_AUTH_DATABASE_URL: preserve(),
      LOBBYSTACK_DISPATCHER_DATABASE_URL: preserve(),
      LOBBYSTACK_WORKER_DATABASE_URL: preserve(),
      NEXT_PUBLIC_TURNSTILE_SITE_KEY: preserve(),
      NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN: preserve(),
      NEXT_PUBLIC_POSTHOG_HOST: preserve(),
      // The landing page's demo call starts at /api/voice/live/session with no
      // signed token; the admin only accepts it for this business, from these sites.
      WEB_CALL_PUBLIC_BUSINESS_SLUG: production ? "lobbystack-mp35s9y1" : "lobbystack",
      WEB_CALL_ALLOWED_ORIGINS: production ? "https://lobbystack.com,https://www.lobbystack.com" : preserve(),
      OPENAI_API_KEY: preserve(),
      NUMBER_CLAIM_TOKEN_SECRET: preserve(),
      POLAR_ACCESS_TOKEN: preserve(),
      POLAR_ORGANIZATION_ID: preserve(),
      POLAR_API_BASE_URL: preserve(),
      POLAR_WEBHOOK_SECRET: preserve(),
      POLAR_ACCEPT_LEGACY_BUSINESS_IDS: production ? "true" : "false",
      POLAR_STARTER_MONTHLY_PRODUCT_ID: preserve(),
      POLAR_STARTER_ANNUAL_PRODUCT_ID: preserve(),
      POLAR_PRO_MONTHLY_PRODUCT_ID: preserve(),
      POLAR_PRO_ANNUAL_PRODUCT_ID: preserve(),
      PROSPECT_DEMO_OPERATOR_EMAIL: preserve(),
      SITE_URL: preserve(),
      TWILIO_ACCOUNT_SID: preserve(),
      TWILIO_AUTH_TOKEN: preserve(),
      TWILIO_SMS_WEBHOOK_URL: production ? preserve() : `${stagingAdminUrl}/api/webhooks/twilio/sms`,
      TWILIO_ALERT_ACCOUNT_SID: preserve(),
      TWILIO_ALERT_SMS_FROM: preserve(),
      TWILIO_ALERT_WEBHOOK_KEY_ID: preserve(),
      TWILIO_ALERT_WEBHOOK_SECRET: preserve(),
      TWILIO_STATUS_CALLBACK_URL: production ? preserve() : `${stagingAdminUrl}/api/webhooks/twilio/status`,
      NODE_ENV: "production",
      OTP_HASH_SECRET: preserve(),
      PORT: preserve(),
      REDIS_PREFIX: preserve(),
      REDIS_URL: preserve(),
      REQUIRE_EMAIL_VERIFICATION: preserve(),
      S3_ACCESS_KEY_ID: preserve(),
      S3_BUCKET: preserve(),
      S3_ENDPOINT: preserve(),
      S3_FORCE_PATH_STYLE: preserve(),
      S3_REGION: preserve(),
      S3_SECRET_ACCESS_KEY: preserve(),
      STORAGE_PROVIDER: preserve(),
      TURNSTILE_SECRET_KEY: preserve(),
      WIDGET_SESSION_SECRET: preserve(),
      // Railway's controlled ingress overwrites x-real-ip with the remote
      // client; use it as the single-value per-client attribution header.
      TRUSTED_CLIENT_IP_HEADER: "x-real-ip",
      FINANCE_EXPORT_ENABLED: preserve(),
      FINANCE_EXPORT_TOKEN: preserve(),
      LOBBYSTACK_FINANCE_EXPORT_DATABASE_URL: preserve(),
      NEXT_PUBLIC_POSTHOG_KEY: preserve(),
      POSTHOG_SOURCEMAP_API_KEY: preserve(),
      NEXT_PUBLIC_WEB_CALL_ENDPOINT: preserve(),
      SEND_VERIFICATION_EMAIL_ON_SIGNUP: preserve(),
      // GPT-Live answers browser and phone calls. OpenAI signs its incoming-call
      // webhook with OPENAI_WEBHOOK_SECRET. See docs/voice/runtime.md.
      LIVE_PROTOTYPE_ENABLED: "true",
      WORKER_INTERNAL_URL: "http://worker.railway.internal:3002",
      OPENAI_WEBHOOK_SECRET: preserve(),
      ...(production ? { LOBBYSTACK_MAINTENANCE_MODE: preserve() } : {}),
    },
  });
  const Postgres = service("Postgres", {
    source: image("pgvector/pgvector:pg16"),
    replicas: { "us-east4-eqdc4a": 1 },
    networking: { privateNetworkEndpoint: "postgres" },
    volumeMounts: { "/var/lib/postgresql/data": postgresVolume },
    // Preserve the staging serverless setting; production stays always-on.
    deploy: { ...(production ? {} : { sleepApplication: true }) },
    env: {
      PGDATA: preserve(),
      POSTGRES_DB: preserve(),
      POSTGRES_PASSWORD: preserve(),
      POSTGRES_USER: preserve(),
    },
  });
  const migrator = service("migrator", {
    build: { buildEnvironment: "V3", builder: "DOCKERFILE", dockerfilePath: "Dockerfile.migrator", watchPatterns: migratorWatchPatterns },
    // Without a health check Railway marks a deployment successful as soon as
    // its container starts. A failed pre-deploy command fails the deployment,
    // so `railway up --ci` in CI and scripts/staging-start.sh see the result.
    preDeploy: production
      ? "sh -c 'node_modules/.bin/tsx dist/cli.js migrate && node_modules/.bin/tsx dist/cli.js bootstrap && node_modules/.bin/tsx dist/cli.js check && VERIFY_RLS_BEHAVIOR=true node_modules/.bin/tsx dist/cli.js verify-rls'"
      : "sh -c 'node_modules/.bin/tsx dist/cli.js migrate && node_modules/.bin/tsx dist/cli.js migrate && node_modules/.bin/tsx dist/cli.js check && VERIFY_RLS_BEHAVIOR=true node_modules/.bin/tsx dist/cli.js verify-rls'",
    start: "true",
    replicas: { "us-east4-eqdc4a": 1 },
    deploy: { restartPolicyType: "NEVER" },
    env: {
      LOBBYSTACK_MIGRATOR_DATABASE_URL: preserve(),
      NODE_ENV: "production",
      ...(production
        ? {
            LOBBYSTACK_AUTH_PASSWORD: preserve(),
            LOBBYSTACK_APP_PASSWORD: preserve(),
            LOBBYSTACK_WORKER_PASSWORD: preserve(),
            LOBBYSTACK_DISPATCHER_PASSWORD: preserve(),
            LOBBYSTACK_READONLY_PASSWORD: preserve(),
            LOBBYSTACK_FINANCE_EXPORT_PASSWORD: preserve(),
          }
        : {}),
    },
  });

  return project("lobbystack", {
    resources: [Redis, worker, admin, Postgres, migrator, postgresVolume, ...redisVolumes, parityCertification],
  });
});
