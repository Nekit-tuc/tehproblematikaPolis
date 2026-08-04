export function normalizeDirectorPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("380")) return digits;
  if (digits.startsWith("80")) return "3" + digits;
  if (digits.startsWith("0")) return "38" + digits;
  return digits;
}

export function directorEmailFromPhone(phone: string) {
  const normalized = normalizeDirectorPhone(phone);
  if (!normalized) return "";
  return "director-" + normalized + "@polissya.local";
}

export function isValidDirectorPhone(phone: string) {
  return normalizeDirectorPhone(phone).length >= 10;
}
