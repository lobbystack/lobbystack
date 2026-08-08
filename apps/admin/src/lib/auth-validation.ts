export function isValidEmailAddress(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function meetsSignupPasswordRequirements(password: string): boolean {
  return password.length >= 8 && /\d/.test(password) && /[^A-Za-z0-9\s]/.test(password);
}
