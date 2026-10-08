import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
// Inherited variables win, and .env.local beats .env: loadEnvFile never replaces a key that is already set.
for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(`${root}/${file}`);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

const child = spawn(process.execPath, [
  `${root}/node_modules/concurrently/dist/bin/index.js`,
  "-n",
  "admin,worker,landing",
  "pnpm dev:admin",
  "pnpm dev:worker",
  "pnpm dev:landing",
], {
  cwd: root,
  env: process.env,
  stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => child.kill(signal));
}

child.once("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});
child.once("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
