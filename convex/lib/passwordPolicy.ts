const MIN_PASSWORD_LENGTH = 12;
const COMMON_WEAK_PASSWORDS = new Set([
  "12345678",
  "123456789",
  "1234567890",
  "123456789012",
  "password",
  "password1",
  "password123",
  "qwerty123",
  "letmein123",
  "adminadmin",
]);

export function validatePasswordRequirements(password: string): void {
  const normalizedForBlocklist = password.toLowerCase().replace(/\s+/g, "");

  if (
    !password ||
    password.length < MIN_PASSWORD_LENGTH ||
    COMMON_WEAK_PASSWORDS.has(normalizedForBlocklist)
  ) {
    throw new Error("Invalid password");
  }
}
