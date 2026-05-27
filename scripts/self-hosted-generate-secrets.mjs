import { generateKeyPairSync, randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

import { isPlaceholderValue, parseArgs, readEnvFile } from "./lib/self-hosted-env.mjs";

const SECRET_KEYS = [
  "SESSION_ENCRYPTION_KEY",
  "INTERNAL_SERVICE_TOKEN",
  "INSTANCE_SECRET",
  "JWT_PRIVATE_KEY",
  "JWKS",
];

function randomSecret() {
  return randomBytes(32).toString("base64url");
}

function randomHexSecret() {
  return randomBytes(32).toString("hex");
}

function envQuote(value) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"").replace(/\n/g, "\\n")}"`;
}

function generateJwtKeys() {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicExponent: 0x10001,
  });

  const privatePem = privateKey.export({
    format: "pem",
    type: "pkcs8",
  });
  const publicJwk = publicKey.export({
    format: "jwk",
  });

  return {
    privateKey: privatePem.trimEnd(),
    jwks: JSON.stringify({
      keys: [
        {
          use: "sig",
          alg: "RS256",
          ...publicJwk,
        },
      ],
    }),
  };
}

function generateSecrets() {
  const jwt = generateJwtKeys();
  return {
    SESSION_ENCRYPTION_KEY: randomSecret(),
    INTERNAL_SERVICE_TOKEN: randomSecret(),
    INSTANCE_SECRET: randomHexSecret(),
    JWT_PRIVATE_KEY: jwt.privateKey,
    JWKS: jwt.jwks,
  };
}

function formatEnv(secrets) {
  return SECRET_KEYS.map((key) => `${key}=${envQuote(secrets[key])}`).join("\n");
}

function getExistingSecretKeys(path) {
  if (!existsSync(path)) {
    return [];
  }

  const env = readEnvFile(path);
  return SECRET_KEYS.filter((key) => env[key] && !isPlaceholderValue(env[key]));
}

function writeSecrets(path, secrets) {
  const replacements = new Map(SECRET_KEYS.map((key) => [key, `${key}=${envQuote(secrets[key])}`]));
  const lines = existsSync(path) ? readFileSync(path, "utf8").split(/\r?\n/) : [];
  const seen = new Set();
  const nextLines = lines.map((line) => {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=/.exec(line);
    if (!match || !replacements.has(match[1])) {
      return line;
    }
    seen.add(match[1]);
    return replacements.get(match[1]);
  });

  for (const key of SECRET_KEYS) {
    if (!seen.has(key)) {
      nextLines.push(replacements.get(key));
    }
  }

  writeFileSync(path, `${nextLines.join("\n").replace(/\n*$/, "")}\n`);
}

const args = parseArgs(process.argv.slice(2));
const writePathIndex = process.argv.indexOf("--write");
const writePath =
  writePathIndex === -1 ? null : process.argv[writePathIndex + 1] ?? null;

if (writePathIndex !== -1 && !writePath) {
  throw new Error("--write requires a path, for example --write .env.self-hosted");
}

const secrets = generateSecrets();

if (writePath) {
  const existingSecretKeys = getExistingSecretKeys(writePath);
  if (existingSecretKeys.length > 0 && !args.force) {
    console.error(
      `Refusing to overwrite existing secrets in ${writePath}: ${existingSecretKeys.join(", ")}.`,
    );
    console.error("Pass --force if you intend to rotate secrets and restart affected services.");
    process.exit(1);
  }

  writeSecrets(writePath, secrets);
  console.log(`Updated ${writePath} with generated self-hosted secrets.`);
} else {
  console.log(formatEnv(secrets));
  console.log("");
  console.log("To update a file directly, run:");
  console.log("  pnpm self-hosted:secrets -- --write .env.self-hosted");
}
