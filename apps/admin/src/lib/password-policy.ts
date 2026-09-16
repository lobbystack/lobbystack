export function meetsPasswordRequirements(password: string): boolean {
  return password.length >= 8 && /\d/.test(password) && /[^A-Za-z0-9\s]/.test(password);
}
