export function validatePasswordRequirements(password: string): void {
  if (!password || password.length < 8) {
    throw new Error("Invalid password");
  }
}
