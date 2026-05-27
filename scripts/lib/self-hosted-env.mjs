import {
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
} from "node:fs";
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

    if (value === "--force") {
      args.force = true;
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

/** Detects user@example.com and user@sub.example.com email placeholders. */
function referencesExampleComEmail(value) {
  const trimmed = value.trim().toLowerCase();
  const atIndex = trimmed.lastIndexOf("@");
  if (atIndex <= 0 || atIndex === trimmed.length - 1) {
    return false;
  }

  const domain = trimmed.slice(atIndex + 1);
  return domain === "example.com" || domain.endsWith(".example.com");
}

export function isPlaceholderValue(value) {
  const normalized = value.trim().toLowerCase();
  return (
    normalized === "" ||
    normalized === "change-me" ||
    normalized.startsWith("change-me-") ||
    referencesExampleComHost(value) ||
    referencesExampleComEmail(value) ||
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
const ENV_LOCAL_LOCK_SUFFIX = ".self-hosted-lock";

function acquireSelfHostedCliLock(rootDir) {
  const lockPath = join(rootDir, `.env.local${ENV_LOCAL_LOCK_SUFFIX}`);
  try {
    const fd = openSync(lockPath, "wx");
    return {
      release() {
        closeSync(fd);
        try {
          unlinkSync(lockPath);
        } catch {
          // Ignore lock cleanup failures.
        }
      },
    };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "EEXIST") {
      throw new Error(
        `Another self-hosted Convex CLI command appears to be running (${lockPath} exists). ` +
          "If no command is running, remove that lock file and retry.",
      );
    }
    throw error;
  }
}

function recoverStaleEnvLocalBackup(envLocalPath, backupPath) {
  const hasEnvLocal = existsSync(envLocalPath);
  const hasBackup = existsSync(backupPath);

  if (!hasEnvLocal && hasBackup) {
    renameSync(backupPath, envLocalPath);
    return;
  }

  if (hasEnvLocal && hasBackup) {
    throw new Error(
      `Found both ${envLocalPath} and ${backupPath}. Remove ${backupPath} or restore it manually before running self-hosted Convex CLI commands.`,
    );
  }
}

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
export function isolateSelfHostedConvexCli(selfHostedEnv, run, options = {}) {
  const rootDir = options.rootDir ?? process.cwd();
  const envLocalPath = join(rootDir, ".env.local");
  const backupPath = `${envLocalPath}${ENV_LOCAL_BACKUP_SUFFIX}`;
  const lock = acquireSelfHostedCliLock(rootDir);

  recoverStaleEnvLocalBackup(envLocalPath, backupPath);

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
    lock.release();
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
