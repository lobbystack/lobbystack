export type PasswordRequirement = "minimumLength" | "number" | "specialCharacter";

/** The requirements a password misses, in the order they are listed. Empty when it meets them all. */
export function failedPasswordRequirements(password: string): PasswordRequirement[] {
  return [
    ...(password.length >= 8 ? [] : ["minimumLength" as const]),
    ...(/\d/.test(password) ? [] : ["number" as const]),
    ...(/[^A-Za-z0-9\s]/.test(password) ? [] : ["specialCharacter" as const]),
  ];
}

export function meetsPasswordRequirements(password: string): boolean {
  return failedPasswordRequirements(password).length === 0;
}
