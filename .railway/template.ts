// LobbyStack self-hosted template project. Railway generates the public template from this project.
// Secrets are generated once with `railway variable set` and kept with preserve(); `randomString()`
// in the SDK is a public hash of the environment name, so it must never produce a secret.
import { bucket, defineRailway, github, preserve, project, service, volume } from "railway/iac";

const TEMPLATE_PROJECT_ID = "c2e1d45e-9a95-4292-a304-a5456bd0cbdd";

export default defineRailway((ctx) => {
  if (ctx.projectId !== TEMPLATE_PROJECT_ID || ctx.environment !== "production") {
    throw new Error("This infrastructure definition manages only the lobbystack-template production environment.");
  }
  const repo = github("lobbystack/lobbystack", { branch: "main", checkSuites: true });
  const region = "us-east4-eqdc4a";
  const sharedWatchPatterns = ["/package.json", "/pnpm-lock.yaml", "/pnpm-workspace.yaml", "/.npmrc", "/tsconfig.base.json", "/packages/**"];
  const migratorWatchPatterns = ["/package.json", "/pnpm-lock.yaml", "/pnpm-workspace.yaml", "/.npmrc", "/tsconfig.base.json", "/packages/db/**", "/packages/contracts/**", "/packages/telemetry/**", "/Dockerfile.migrator"];

  const postgresVolume = volume("postgres-data", { region, sizeMB: 5000 });
  const redisVolume = volume("redis-volume", { region, sizeMB: 1000 });
  const storage = bucket("lobbystack-template", { region: "iad" });

  // Stock image: the migrate service creates the roles (0000_roles.sql) and sets their logins
  // (`bootstrap`). The role passwords live here so every service references one copy.
  const Postgres = service("Postgres", {
    source: { image: "pgvector/pgvector:pg16" },
    replicas: { [region]: 1 },
    networking: { privateNetworkEndpoint: "postgres" },
    volumeMounts: { "/var/lib/postgresql/data": postgresVolume },
    env: {
      // initdb refuses a mount point that contains lost+found, so use a subdirectory.
      PGDATA: "/var/lib/postgresql/data/pgdata",
      POSTGRES_DB: "lobbystack",
      POSTGRES_USER: "postgres",
      POSTGRES_PASSWORD: preserve(),
      LOBBYSTACK_MIGRATOR_PASSWORD: preserve(),
      LOBBYSTACK_AUTH_PASSWORD: preserve(),
      LOBBYSTACK_APP_PASSWORD: preserve(),
      LOBBYSTACK_WORKER_PASSWORD: preserve(),
      LOBBYSTACK_DISPATCHER_PASSWORD: preserve(),
      LOBBYSTACK_READONLY_PASSWORD: preserve(),
    },
  });
  const roleUrl = (role: string, passwordVariable: string) =>
    `postgresql://${role}:\${{Postgres.${passwordVariable}}}@\${{Postgres.RAILWAY_PRIVATE_DOMAIN}}:5432/lobbystack`;

  const Redis = service("Redis", {
    source: { image: "redis:7-alpine" },
    replicas: { [region]: 1 },
    networking: { privateNetworkEndpoint: "redis" },
    volumeMounts: { "/data": redisVolume },
    startCommand: "sh -c 'exec redis-server --bind :: 0.0.0.0 --appendonly yes --maxmemory-policy noeviction --requirepass \"$REDIS_PASSWORD\"'",
    env: { REDIS_PASSWORD: preserve() },
  });
  const redisUrl = "redis://default:${{Redis.REDIS_PASSWORD}}@${{Redis.RAILWAY_PRIVATE_DOMAIN}}:6379";

  const adminOrigin = "https://${{admin.RAILWAY_PUBLIC_DOMAIN}}";
  const voiceOrigin = "https://${{voice-gateway.RAILWAY_PUBLIC_DOMAIN}}";
  const s3 = {
    STORAGE_PROVIDER: "s3",
    S3_BUCKET: "${{lobbystack-template.BUCKET}}",
    S3_ENDPOINT: "${{lobbystack-template.ENDPOINT}}",
    S3_REGION: "${{lobbystack-template.REGION}}",
    S3_ACCESS_KEY_ID: "${{lobbystack-template.ACCESS_KEY_ID}}",
    S3_SECRET_ACCESS_KEY: "${{lobbystack-template.SECRET_ACCESS_KEY}}",
    S3_FORCE_PATH_STYLE: "false",
  };
  const runtime = {
    NODE_ENV: "production",
    DEPLOYMENT_MODE: "self_hosted_standard",
    REDIS_URL: redisUrl,
    REDIS_PREFIX: "lobbystack",
  };
  // User-supplied at deploy time. The published template marks these as required inputs.
  const providers = {
    OPENAI_API_KEY: preserve(),
    TWILIO_ACCOUNT_SID: preserve(),
    TWILIO_AUTH_TOKEN: preserve(),
  };

  const migrate = service("migrate", {
    source: repo,
    build: { buildEnvironment: "V3", builder: "DOCKERFILE", dockerfilePath: "Dockerfile.migrator", watchPatterns: migratorWatchPatterns },
    start: "sh -c 'node_modules/.bin/tsx dist/cli.js migrate && node_modules/.bin/tsx dist/cli.js bootstrap && node_modules/.bin/tsx dist/cli.js check && VERIFY_RLS_BEHAVIOR=true node_modules/.bin/tsx dist/cli.js verify-rls'",
    replicas: { [region]: 1 },
    deploy: { restartPolicyType: "NEVER" },
    env: {
      NODE_ENV: "production",
      // Same as Docker Compose: migrations run as the superuser, which needs to create
      // extensions (vector) and objects in the public schema. Runtime services use the scoped roles.
      DATABASE_URL: "postgresql://postgres:${{Postgres.POSTGRES_PASSWORD}}@${{Postgres.RAILWAY_PRIVATE_DOMAIN}}:5432/lobbystack",
      LOBBYSTACK_MIGRATOR_PASSWORD: "${{Postgres.LOBBYSTACK_MIGRATOR_PASSWORD}}",
      LOBBYSTACK_AUTH_PASSWORD: "${{Postgres.LOBBYSTACK_AUTH_PASSWORD}}",
      LOBBYSTACK_APP_PASSWORD: "${{Postgres.LOBBYSTACK_APP_PASSWORD}}",
      LOBBYSTACK_WORKER_PASSWORD: "${{Postgres.LOBBYSTACK_WORKER_PASSWORD}}",
      LOBBYSTACK_DISPATCHER_PASSWORD: "${{Postgres.LOBBYSTACK_DISPATCHER_PASSWORD}}",
      LOBBYSTACK_READONLY_PASSWORD: "${{Postgres.LOBBYSTACK_READONLY_PASSWORD}}",
    },
  });

  // admin owns the shared application secrets; worker and voice-gateway reference them.
  const admin = service("admin", {
    source: repo,
    build: { buildEnvironment: "V3", builder: "DOCKERFILE", dockerfilePath: "Dockerfile.admin", watchPatterns: [...sharedWatchPatterns, "/apps/admin/**", "/scripts/copy-widget-embed.mjs", "/Dockerfile.admin"] },
    healthcheck: "/api/health/ready",
    healthcheckTimeout: 300,
    replicas: { [region]: 1 },
    deploy: { restartPolicyMaxRetries: 3 },
    env: {
      ...runtime,
      ...s3,
      ...providers,
      PORT: "3000",
      HOSTNAME: "::",
      APP_BASE_URL: adminOrigin,
      SITE_URL: adminOrigin,
      AUTH_TRUSTED_ORIGINS: adminOrigin,
      BETTER_AUTH_USE_SECURE_COOKIES: "true",
      REQUIRE_EMAIL_VERIFICATION: "false",
      WIDGET_KEY_ISSUANCE_ENABLED: "false",
      NEXT_PUBLIC_WEB_CALL_ENDPOINT: `${voiceOrigin}/web-call/sessions`,
      TWILIO_SMS_WEBHOOK_URL: `${adminOrigin}/api/webhooks/twilio/sms`,
      TWILIO_STATUS_CALLBACK_URL: `${adminOrigin}/api/webhooks/twilio/status`,
      // Other role URLs are built from DATABASE_URL and the role passwords (packages/db roleDatabaseUrl).
      DATABASE_URL: roleUrl("lobbystack_app", "LOBBYSTACK_APP_PASSWORD"),
      LOBBYSTACK_AUTH_PASSWORD: "${{Postgres.LOBBYSTACK_AUTH_PASSWORD}}",
      LOBBYSTACK_WORKER_PASSWORD: "${{Postgres.LOBBYSTACK_WORKER_PASSWORD}}",
      LOBBYSTACK_DISPATCHER_PASSWORD: "${{Postgres.LOBBYSTACK_DISPATCHER_PASSWORD}}",
      BETTER_AUTH_SECRET: preserve(),
      ENCRYPTION_KEY: preserve(),
      INTERNAL_SERVICE_SECRET: preserve(),
      INTERNAL_SERVICE_TOKEN: preserve(),
      NUMBER_CLAIM_TOKEN_SECRET: preserve(),
      OTP_HASH_SECRET: preserve(),
      WIDGET_SESSION_SECRET: preserve(),
      // Railway's controlled ingress overwrites x-real-ip with the remote
      // client; use it as the single-value per-client attribution header.
      TRUSTED_CLIENT_IP_HEADER: "x-real-ip",
    },
  });

  const worker = service("worker", {
    source: repo,
    build: { buildEnvironment: "V3", builder: "DOCKERFILE", dockerfilePath: "Dockerfile.worker", watchPatterns: [...sharedWatchPatterns, "/apps/worker/**", "/Dockerfile.worker"] },
    healthcheck: "/health/ready",
    healthcheckTimeout: 300,
    replicas: { [region]: 1 },
    deploy: { restartPolicyMaxRetries: 3 },
    env: {
      ...runtime,
      ...s3,
      ...providers,
      PORT: "3002",
      APP_BASE_URL: adminOrigin,
      TWILIO_STATUS_CALLBACK_URL: `${adminOrigin}/api/webhooks/twilio/status`,
      DATABASE_URL: roleUrl("lobbystack_worker", "LOBBYSTACK_WORKER_PASSWORD"),
      LOBBYSTACK_DISPATCHER_PASSWORD: "${{Postgres.LOBBYSTACK_DISPATCHER_PASSWORD}}",
      ENCRYPTION_KEY: "${{admin.ENCRYPTION_KEY}}",
      OTP_HASH_SECRET: "${{admin.OTP_HASH_SECRET}}",
      INTERNAL_SERVICE_SECRET: "${{admin.INTERNAL_SERVICE_SECRET}}",
      INTERNAL_SERVICE_TOKEN: "${{admin.INTERNAL_SERVICE_TOKEN}}",
    },
  });

  const voiceGateway = service("voice-gateway", {
    source: repo,
    build: { buildEnvironment: "V3", builder: "DOCKERFILE", dockerfilePath: "Dockerfile.voice-gateway", watchPatterns: [...sharedWatchPatterns, "/apps/voice-gateway/**", "/Dockerfile.voice-gateway"] },
    healthcheck: "/health/ready",
    healthcheckTimeout: 300,
    replicas: { [region]: 1 },
    deploy: { restartPolicyMaxRetries: 3 },
    env: {
      ...runtime,
      ...providers,
      PORT: "3001",
      // Do not trust all forwarded-for hops. Railway's controlled ingress
      // overwrites x-real-ip, which the gateway opts into below.
      VOICE_GATEWAY_TRUST_PROXY: "false",
      TRUSTED_CLIENT_IP_HEADER: "x-real-ip",
      APP_BASE_URL: adminOrigin,
      VOICE_GATEWAY_BASE_URL: voiceOrigin,
      BACKEND_INTERNAL_URL: "http://${{admin.RAILWAY_PRIVATE_DOMAIN}}:3000",
      WEB_CALL_ALLOWED_ORIGINS: adminOrigin,
      INTERNAL_SERVICE_SECRET: "${{admin.INTERNAL_SERVICE_SECRET}}",
      INTERNAL_SERVICE_TOKEN: "${{admin.INTERNAL_SERVICE_TOKEN}}",
    },
  });

  return project("lobbystack-template", {
    resources: [Postgres, Redis, migrate, admin, worker, voiceGateway, postgresVolume, redisVolume, storage],
  });
});
