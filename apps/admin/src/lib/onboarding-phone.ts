export function maskPhone(phone: string): string {
  if (phone.length < 4) return phone;
  const last = phone.slice(-4);
  return `${phone.slice(0, Math.max(2, phone.length - 8))}${"•".repeat(Math.max(2, phone.length - 6))}${last}`;
}
