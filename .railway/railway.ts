// LobbyStack platform infrastructure (staging and production). Secrets remain in Railway via preserve().
import { bucket, database, defineRailway, image, preserve, project, service, volume } from "railway/iac";

export default defineRailway((ctx) => {
  if (ctx.projectId !== "af0a130e-7b02-4fc0-94ef-b0ac45a0a0a6" || !["staging", "production"].includes(ctx.environment)) {
    throw new Error("This infrastructure definition manages only the lobbystack staging or production environment.");
  }
  const production = ctx.environment === "production";
  const stagingAdminUrl = "https://admin-staging-7e92.up.railway.app";
  const observability = {
    OTEL_EXPORTER_OTLP_ENDPOINT: preserve(),
    OTEL_EXPORTER_OTLP_HEADERS: preserve(),
    SERVICE_VERSION: preserve(),
  };
  const Redis = database(production ? "Redis-production" : "Redis", "redis", { image: "redis:7-alpine", region: "us-east4-eqdc4a", defaultMountPath: "/data" });
  Redis.deploy = { startCommand: "sh -c 'exec redis-server --bind :: 0.0.0.0 --appendonly yes --maxmemory-policy noeviction --requirepass \"$REDIS_PASSWORD\"'", ...(production ? {} : { sleepApplication: true }) };
  Redis.networking = { privateNetworkEndpoint: "redis" };
  const postgresVolume = volume(production ? "postgres-volume-production" : "postgres-volume", { alerts: { usage: { "100": {}, "80": {}, "95": {} } }, allowOnlineResize: true, region: "us-east4-eqdc4a", sizeMB: 5000 });
  const redisVolume = volume(production ? "redis-volume-production" : "redis-volume", { alerts: { usage: { "100": {}, "80": {}, "95": {} } }, allowOnlineResize: true, region: "us-east4-eqdc4a", sizeMB: 5000 });
  Redis.variables = { REDIS_PASSWORD: preserve() };
  // The database product owns its existing /data mount. Keep the volume resource
  // below, but do not also manage it as a service attachment (perpetual CLI drift).
  const parityCertification = bucket(production ? "lobbystack-production" : "parity-certification", { region: "iad" });
  const worker = service("worker", {
    build: { buildEnvironment: "V3", builder: "DOCKERFILE", dockerfilePath: "Dockerfile.worker" },
    healthcheck: "/health/ready",
    healthcheckTimeout: 300,
    preDeploy: [],
    replicas: { "us-east4-eqdc4a": 1 },
    deploy: { restartPolicyMaxRetries: 3, ...(production ? {} : { sleepApplication: true }) },
    env: {
      ...observability,
      APP_BASE_URL: preserve(),
      DATABASE_URL: preserve(),
      DEPLOYMENT_MODE: preserve(),
      ENCRYPTION_KEY: preserve(),
      LOBBYSTACK_DISPATCHER_DATABASE_URL: preserve(),
      LOBBYSTACK_WORKER_DATABASE_URL: preserve(),
      OPENAI_API_KEY: preserve(),
      EMAIL_FROM: preserve(),
      FEEDBACK_TO_EMAIL: preserve(),
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
      TWILIO_VERIFY_SERVICE_SID: preserve(),
      TWILIO_ALERT_ACCOUNT_SID: preserve(),
      TWILIO_ALERT_SMS_FROM: preserve(),
      TWILIO_ALERT_API_KEY_SID: preserve(),
      TWILIO_ALERT_API_KEY_SECRET: preserve(),
      TWILIO_STATUS_CALLBACK_URL: production ? preserve() : `${stagingAdminUrl}/api/webhooks/twilio/status`,
      NODE_ENV: preserve(),
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
  const voiceGateway = service("voice-gateway", {
    build: { buildEnvironment: "V3", builder: "DOCKERFILE", dockerfilePath: "Dockerfile.voice-gateway" },
    healthcheck: "/health/ready",
    healthcheckTimeout: 300,
    replicas: { "us-east4-eqdc4a": 1 },
    // Serverless (app sleeping): preserve the staging setting; production stays always-on.
    deploy: { restartPolicyMaxRetries: 3, ...(production ? {} : { sleepApplication: true }) },
    env: {
      ...observability,
      APP_BASE_URL: preserve(),
      BACKEND_INTERNAL_URL: preserve(),
      DASHBOARD_TEST_CALL_TOKEN: preserve(),
      DEPLOYMENT_MODE: preserve(),
      INTERNAL_SERVICE_SECRET: preserve(),
      INTERNAL_SERVICE_TOKEN: preserve(),
      OPENAI_API_KEY: preserve(),
      TWILIO_ACCOUNT_SID: preserve(),
      TWILIO_AUTH_TOKEN: preserve(),
      NODE_ENV: preserve(),
      PORT: preserve(),
      REDIS_PREFIX: preserve(),
      REDIS_URL: preserve(),
      VOICE_GATEWAY_BASE_URL: preserve(),
      WEB_CALL_ALLOWED_ORIGINS: preserve(),
      POSTHOG_KEY: preserve(),
      POSTHOG_HOST: preserve(),
      POSTHOG_PRIVACY_MODE: preserve(),
      OPENAI_REALTIME_MODEL: preserve(),
      VOICE_VAD_SILENCE_MS: preserve(),
      ...(production
        ? {
            S3_ACCESS_KEY_ID: preserve(),
            S3_BUCKET: preserve(),
            S3_ENDPOINT: preserve(),
            S3_FORCE_PATH_STYLE: preserve(),
            S3_REGION: preserve(),
            S3_SECRET_ACCESS_KEY: preserve(),
          }
        : {}),
    },
  });
  const admin = service("admin", {
    build: { buildEnvironment: "V3", builder: "DOCKERFILE", dockerfilePath: "Dockerfile.admin" },
    healthcheck: "/api/health/ready",
    healthcheckTimeout: 300,
    replicas: { "us-east4-eqdc4a": 1 },
    // Serverless (app sleeping): preserve the staging setting; production stays always-on.
    deploy: { restartPolicyMaxRetries: 3, ...(production ? {} : { sleepApplication: true }) },
    env: {
      ...observability,
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
      NEXT_PUBLIC_WEB_CALL_ENDPOINT: preserve(),
      OPENAI_API_KEY: preserve(),
      NUMBER_CLAIM_TOKEN_SECRET: preserve(),
      POLAR_ACCESS_TOKEN: preserve(),
      POLAR_ORGANIZATION_ID: preserve(),
      POLAR_API_BASE_URL: preserve(),
      POLAR_WEBHOOK_SECRET: preserve(),
      POLAR_STARTER_MONTHLY_PRODUCT_ID: preserve(),
      POLAR_STARTER_ANNUAL_PRODUCT_ID: preserve(),
      POLAR_PRO_MONTHLY_PRODUCT_ID: preserve(),
      POLAR_PRO_ANNUAL_PRODUCT_ID: preserve(),
      PROSPECT_DEMO_OPERATOR_EMAIL: preserve(),
      SITE_URL: preserve(),
      TWILIO_ACCOUNT_SID: preserve(),
      TWILIO_AUTH_TOKEN: preserve(),
      TWILIO_VERIFY_SERVICE_SID: preserve(),
      TWILIO_SMS_WEBHOOK_URL: production ? preserve() : `${stagingAdminUrl}/api/webhooks/twilio/sms`,
      TWILIO_ALERT_ACCOUNT_SID: preserve(),
      TWILIO_ALERT_SMS_FROM: preserve(),
      TWILIO_ALERT_WEBHOOK_KEY_ID: preserve(),
      TWILIO_ALERT_WEBHOOK_SECRET: preserve(),
      TWILIO_STATUS_CALLBACK_URL: production ? preserve() : `${stagingAdminUrl}/api/webhooks/twilio/status`,
      NODE_ENV: preserve(),
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
      SEND_VERIFICATION_EMAIL_ON_SIGNUP: preserve(),
      STORAGE_PROVIDER: preserve(),
      TURNSTILE_SECRET_KEY: preserve(),
      WIDGET_SESSION_SECRET: preserve(),
      FINANCE_EXPORT_ENABLED: preserve(),
      FINANCE_EXPORT_TOKEN: preserve(),
      LOBBYSTACK_FINANCE_EXPORT_DATABASE_URL: preserve(),
      NEXT_PUBLIC_POSTHOG_KEY: preserve(),
      POSTHOG_SOURCEMAP_API_KEY: preserve(),
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
    build: { buildEnvironment: "V3", builder: "DOCKERFILE", dockerfilePath: "Dockerfile.migrator" },
    start: production
      ? "sh -c 'node_modules/.bin/tsx dist/cli.js migrate && node_modules/.bin/tsx dist/cli.js bootstrap && node_modules/.bin/tsx dist/cli.js check && VERIFY_RLS_BEHAVIOR=true node_modules/.bin/tsx dist/cli.js verify-rls'"
      : "sh -c 'node_modules/.bin/tsx dist/cli.js migrate && node_modules/.bin/tsx dist/cli.js migrate && node_modules/.bin/tsx dist/cli.js check && VERIFY_RLS_BEHAVIOR=true node_modules/.bin/tsx dist/cli.js verify-rls'",
    replicas: { "us-east4-eqdc4a": 1 },
    deploy: { restartPolicyType: "NEVER" },
    env: {
      LOBBYSTACK_MIGRATOR_DATABASE_URL: preserve(),
      NODE_ENV: preserve(),
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
    resources: [Redis, worker, voiceGateway, admin, Postgres, migrator, postgresVolume, redisVolume, parityCertification],
  });
});
