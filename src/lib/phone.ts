// Brazilian area codes (DDD) in use.
const BR_DDD = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38, 41, 42, 43, 44, 45, 46, 47, 48, 49, 51, 53, 54, 55,
  61, 62, 63, 64, 65, 66, 67, 68, 69, 71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88, 89, 91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

export const onlyDigits = (value: string) => value.replace(/\D/g, "");

// Input already carries the country code (the widget prepends it). Returns null when invalid.
export function normalizePhone(value: string): string | null {
  const digits = onlyDigits(value);
  if (digits.startsWith("55")) {
    const match = digits.match(/^55(\d{2})(\d{8,9})$/);
    if (!match || !BR_DDD.has(Number(match[1]))) return null;
    // Brazilian mobile numbers have 9 digits starting with 9; landlines have 8.
    if (match[2]!.length === 9 && !match[2]!.startsWith("9")) return null;
    return digits;
  }
  return /^\d{8,15}$/.test(digits) ? digits : null;
}

// "+55 (11) 91234-5678" for Brazil, "+<digits>" otherwise.
export function formatPhone(digits: string): string {
  const match = digits.match(/^55(\d{2})(\d{4,5})(\d{4})$/);
  return match ? `+55 (${match[1]}) ${match[2]}-${match[3]}` : `+${digits}`;
}
