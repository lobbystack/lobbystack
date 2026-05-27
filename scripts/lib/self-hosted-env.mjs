import { existsSync, readFileSync, renameSync } from "node:fs";
import { join } from "node:path";

export function parseArgs(argv) {
  const args = {
    passthrough: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--env-file") {
      const next = argv[index + 1];
      if (!next) {
        throw new Error("--env-file requires a path.");
      }
      args.envFile = next;
      index += 1;
      continue;
    }

    if (value === "--dry-run") {
      args.dryRun = true;
      continue;
    }

    if (value === "--include-empty") {
      args.includeEmpty = true;
      continue;
    }

    args.passthrough.push(value);
  }

  return args;
}

export function resolveEnvFile(inputPath) {
  const envFile = inputPath ?? process.env.SELF_HOSTED_ENV_FILE ?? ".env.self-hosted";
  if (!existsSync(envFile)) {
    throw new Error(
      `${envFile} does not exist. Copy .env.self-hosted.example to ${envFile} and fill it in first.`,
    );
  }
  return envFile;
}

function unquoteEnvValue(value) {
  const trimmed = value.trim();
  if (trimmed.length < 2) {
    return trimmed;
  }

  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];
  if ((first !== "\"" && first !== "'") || first !== last) {
    return trimmed;
  }

  const inner = trimmed.slice(1, -1);
  if (first === "'") {
    return inner;
  }

  return inner
    .replace(/\\n/g, "\n")
    .replace(/\\"/g, "\"")
    .replace(/\\\\/g, "\\");
}

export function readEnvFile(envFile) {
  const env = {};
  const contents = readFileSync(envFile, "utf8");
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const equalsIndex = line.indexOf("=");
    if (equalsIndex === -1) {
      continue;
    }

    const key = line.slice(0, equalsIndex).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      continue;
    }

    const rawValue = line.slice(equalsIndex + 1);
    env[key] = unquoteEnvValue(rawValue);
  }
  return env;
}

/** Detects example.com / *.example.com as URL host (not arbitrary substrings). */
function referencesExampleComHost(value) {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }

  try {
    const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const { hostname } = new URL(withScheme);
    const host = hostname.toLowerCase();
    return host === "example.com" || host.endsWith(".example.com");
  } catch {
    return false;
  }
}

export function isPlaceholderValue(value) {
  const normalized = value.trim().toLowerCase();
  return (
    normalized === "" ||
    normalized === "change-me" ||
    normalized.startsWith("change-me-") ||
    referencesExampleComHost(value) ||
    normalized.includes("your-") ||
    normalized.includes("<your")
  );
}

export function requireEnv(env, keys) {
  const missing = keys.filter((key) => !env[key] || isPlaceholderValue(env[key]));
  if (missing.length > 0) {
    throw new Error(`Fill in required self-hosted env values first: ${missing.join(", ")}`);
  }
}

export function redactValue(key, value) {
  if (!value) {
    return "<empty>";
  }

  if (
    key.endsWith("_URL") ||
    key.endsWith("_HOST") ||
    key.endsWith("_HOSTNAME") ||
    key === "DEPLOYMENT_MODE" ||
    key === "POLAR_SERVER" ||
    key.endsWith("_MODEL") ||
    key === "EMAIL_FROM_ADDRESS" ||
    key === "FEEDBACK_TO_EMAIL"
  ) {
    return value;
  }

  return "<redacted>";
}

const ENV_LOCAL_BACKUP_SUFFIX = ".self-hosted-bak";

/** Env for Convex CLI against a self-hosted backend (not Convex Cloud). */
export function selfHostedCliEnv(selfHostedEnv) {
  const {
    CONVEX_DEPLOYMENT: _deployment,
    CONVEX_DEPLOY_KEY: _deployKey,
    ...rest
  } = process.env;

  return {
    ...rest,
    CONVEX_SELF_HOSTED_URL: selfHostedEnv.CONVEX_SELF_HOSTED_URL,
    CONVEX_SELF_HOSTED_ADMIN_KEY: selfHostedEnv.CONVEX_SELF_HOSTED_ADMIN_KEY,
  };
}

/**
 * Convex CLI auto-loads `.env.local`, which sets CONVEX_DEPLOYMENT for cloud dev.
 * Hide it while targeting a self-hosted backend.
 */
export function isolateSelfHostedConvexCli(selfHostedEnv, run) {
  const envLocalPath = join(process.cwd(), ".env.local");
  const backupPath = `${envLocalPath}${ENV_LOCAL_BACKUP_SUFFIX}`;
  const hadEnvLocal = existsSync(envLocalPath);

  if (hadEnvLocal) {
    renameSync(envLocalPath, backupPath);
  }

  try {
    return run(selfHostedCliEnv(selfHostedEnv));
  } finally {
    if (hadEnvLocal && existsSync(backupPath)) {
      renameSync(backupPath, envLocalPath);
    }
  }
}

export function getPnpmInvocation() {
  const npmExecPath = process.env.npm_execpath;
  if (npmExecPath && npmExecPath.includes("pnpm")) {
    return {
      command: process.execPath,
      args: [npmExecPath],
    };
  }

  return {
    command: "pnpm",
    args: [],
  };
}
