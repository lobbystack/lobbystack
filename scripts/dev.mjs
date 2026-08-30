import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { loadLocalEnv } from "./load-local-env.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
loadLocalEnv([`${root}/.env`, `${root}/.env.local`]);

const child = spawn(process.execPath, [
  `${root}/node_modules/concurrently/dist/bin/concurrently.js`,
  "-n",
  "admin,worker,voice,landing",
  "pnpm dev:admin",
  "pnpm dev:worker",
  "pnpm dev:voice",
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
