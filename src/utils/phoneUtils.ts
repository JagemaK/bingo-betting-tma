/**
 * Client-Side Ethiopian Phone Normalization and Format Helper
 * Mirrors server/PhoneUtils.ts for canonical E.164 consistency.
 */

export function normalizeEthiopianPhone(input: string | null | undefined): string | null {
  if (!input || typeof input !== 'string') return null;

  let cleaned = input.trim();
  let digits = cleaned.replace(/\D/g, '');

  if (!digits) return null;

  if (digits.startsWith('251')) {
    digits = digits.substring(3);
  }

  if (digits.startsWith('0')) {
    digits = digits.substring(1);
  }

  if (digits.length === 9 && (digits.startsWith('9') || digits.startsWith('7'))) {
    return `+251${digits}`;
  }

  return null;
}

export function isValidEthiopianPhone(input: string | null | undefined): boolean {
  return normalizeEthiopianPhone(input) !== null;
}

export function formatLocalPhone(phone: string | null | undefined): string {
  const norm = normalizeEthiopianPhone(phone);
  if (!norm) return phone || '';
  const local9 = norm.slice(4);
  return `0${local9.slice(0, 3)} ${local9.slice(3, 6)} ${local9.slice(6)}`;
}
