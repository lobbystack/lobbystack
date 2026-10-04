const MIN_PRODUCTION_SECRET_LENGTH = 32;
const knownInsecureSecretValues = new Set([
  "change-me-before-production",
  "development-only-change-me",
  "local-internal-token",
]);

function isInsecureProductionSecret(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return (
    value.trim().length < MIN_PRODUCTION_SECRET_LENGTH ||
    knownInsecureSecretValues.has(normalized) ||
    normalized.startsWith("replace-with-")
  );
}

export function assertProductionSecrets(
  source: Record<string, unknown>,
  requiredNames: readonly string[],
): void {
  if (source.NODE_ENV !== "production") return;

  for (const name of requiredNames) {
    const value = source[name];
    if (typeof value !== "string" || !value.trim()) {
      throw new Error(`${name} is required in production.`);
    }
    if (isInsecureProductionSecret(value)) {
      throw new Error(`${name} must be at least ${MIN_PRODUCTION_SECRET_LENGTH} characters and must not use a placeholder value in production.`);
    }
  }
}
