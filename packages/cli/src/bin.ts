import { createInterface } from "node:readline/promises";

import { main } from "./main";

process.exitCode = await main({
  argv: process.argv.slice(2),
  env: process.env,
  out: (text) => process.stdout.write(`${text}\n`),
  err: (text) => process.stderr.write(`${text}\n`),
  async confirm(question) {
    // Only a person at a terminal can answer; anything else is a no. CI can
    // give a job a terminal with nobody at it, so CI is a no too.
    const ci = process.env.CI?.trim().toLowerCase();
    if (!process.stdin.isTTY || !process.stderr.isTTY || (ci && ci !== "false" && ci !== "0")) return false;
    const prompt = createInterface({ input: process.stdin, output: process.stderr });
    try {
      return /^y(es)?$/i.test((await prompt.question(`${question} [y/N] `)).trim());
    } finally {
      prompt.close();
    }
  },
  async readStdin() {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks).toString("utf8");
  },
});
