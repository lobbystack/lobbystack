#!/usr/bin/env node
import { spawn } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { closeAllPools, getPool } from "./client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, "..");
const migrationsDir = path.join(packageRoot, "migrations");

const command = process.argv[2];

async function runSqlFiles(files: string[]): Promise<void> {
  const pool = getPool("migrator");
  const client = await pool.connect();

  try {
    for (const file of files) {
      const sql = await readFile(path.join(migrationsDir, file), "utf8");
      console.log(`Applying ${file}...`);
      await client.query(sql);
      console.log(`Applied ${file}`);
    }
  } finally {
    client.release();
  }
}

async function migrate(): Promise<void> {
  const files = (await readdir(migrationsDir))
    .filter((file) => file.endsWith(".sql"))
    .sort();

  if (files.length === 0) {
    throw new Error("No SQL migrations found");
  }

  await runSqlFiles(files);
}

async function check(): Promise<void> {
  const pool = getPool("migrator");
  const client = await pool.connect();

  try {
    const extensions = await client.query<{ extname: string }>(
      `SELECT extname FROM pg_extension WHERE extname IN ('vector', 'pgcrypto')`,
    );
    const roles = await client.query<{ rolname: string }>(
      `SELECT rolname FROM pg_roles WHERE rolname LIKE 'lobbystack_%'`,
    );

    console.log(
      JSON.stringify(
        {
          ok: true,
          extensions: extensions.rows.map((row) => row.extname),
          roles: roles.rows.map((row) => row.rolname),
        },
        null,
        2,
      ),
    );
  } finally {
    client.release();
  }
}

async function seed(): Promise<void> {
  const pool = getPool("migrator");
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO app.businesses (slug, name)
       VALUES ('demo', 'Demo Business')
       ON CONFLICT DO NOTHING`,
    );
    await client.query("COMMIT");
    console.log("Seed completed");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function resetTest(): Promise<void> {
  const pool = getPool("migrator");
  const client = await pool.connect();

  try {
    await client.query(`
      DO $$
      DECLARE
        table_name text;
      BEGIN
        FOR table_name IN
          SELECT tablename
          FROM pg_tables
          WHERE schemaname IN ('app', 'auth')
        LOOP
          EXECUTE format('TRUNCATE TABLE %I.%I RESTART IDENTITY CASCADE', 'app', table_name);
        END LOOP;
      END $$;
    `);
    console.log("Test database reset completed");
  } finally {
    client.release();
  }
}

async function verifyRls(): Promise<void> {
  const pool = getPool("migrator");
  const client = await pool.connect();

  try {
    const policies = await client.query<{ tablename: string; policyname: string }>(
      `SELECT tablename, policyname
       FROM pg_policies
       WHERE schemaname = 'app'
       ORDER BY tablename, policyname`,
    );

    const rlsEnabled = await client.query<{
      relname: string;
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
    }>(
      `SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'app' AND c.relkind = 'r'
       ORDER BY c.relname`,
    );

    const missingForce = rlsEnabled.rows.filter(
      (row) => !row.relrowsecurity || !row.relforcerowsecurity,
    );

    console.log(
      JSON.stringify(
        {
          ok: missingForce.length === 0,
          policyCount: policies.rows.length,
          tablesWithoutForceRls: missingForce.map((row) => row.relname),
        },
        null,
        2,
      ),
    );

    if (missingForce.length > 0) {
      process.exitCode = 1;
    }
  } finally {
    client.release();
  }
}

function generate(): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "pnpm",
      ["exec", "drizzle-kit", "generate", "--config", "drizzle.config.ts"],
      {
        cwd: packageRoot,
        stdio: "inherit",
        shell: true,
      },
    );

    child.on("exit", (code) => {
      if (code === 0) {
        resolve(0);
      } else {
        reject(new Error(`drizzle-kit generate failed with code ${code ?? 1}`));
      }
    });
  });
}

async function main(): Promise<void> {
  switch (command) {
    case "generate":
      await generate();
      break;
    case "migrate":
      await migrate();
      break;
    case "check":
      await check();
      break;
    case "seed":
      await seed();
      break;
    case "reset:test":
      await resetTest();
      break;
    case "verify-rls":
      await verifyRls();
      break;
    default:
      console.error(
        "Usage: tsx src/cli.ts <generate|migrate|check|seed|reset:test|verify-rls>",
      );
      process.exitCode = 1;
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeAllPools();
  });
