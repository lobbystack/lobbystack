// Unit tests must not depend on the shell that runs them. Builds read the
// NEXT_PUBLIC_ variables (CI's replacement job sets NEXT_PUBLIC_APP_URL for its
// e2e build, and runs `pnpm test` in the same step), and some modules read them
// at import, so drop them before each test file loads. A test that needs one
// sets it with vi.stubEnv.
for (const name of Object.keys(process.env)) {
  if (name.startsWith("NEXT_PUBLIC_")) delete process.env[name];
}
