import { existsSync, readFileSync } from "node:fs";

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

export function isPlaceholderValue(value) {
  const normalized = value.trim().toLowerCase();
  return (
    normalized === "" ||
    normalized === "change-me" ||
    normalized.startsWith("change-me-") ||
    normalized.includes("example.com") ||
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
