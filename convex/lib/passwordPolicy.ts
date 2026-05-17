const MIN_PASSWORD_LENGTH = 8;
const HAS_NUMBER = /\d/;
const HAS_SPECIAL_CHARACTER = /[^A-Za-z0-9\s]/;

export function validatePasswordRequirements(password: string): void {
  if (
    !password ||
    password.length < MIN_PASSWORD_LENGTH ||
    !HAS_NUMBER.test(password) ||
    !HAS_SPECIAL_CHARACTER.test(password)
  ) {
    throw new Error("Invalid password");
  }
}
