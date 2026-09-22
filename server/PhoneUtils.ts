/**
 * Authoritative Ethiopian Phone Number Normalization and Validation
 *
 * Supported formats:
 * - Local standard: 0912345678, 0712345678
 * - International standard: +251912345678, +251712345678
 * - Country code without plus: 251912345678, 251712345678
 * - Spaced or punctuated: +251 912 345 678, 0912-34-56-78, (0912) 345678
 * - Country code + local zero: +2510912345678, 2510912345678
 *
 * Canonical representation:
 * E.164 standard: +2519XXXXXXXX or +2517XXXXXXXX
 * (Exactly 13 characters: '+' followed by 251 followed by 9 digits starting with 9 or 7)
 */

export function normalizeEthiopianPhone(input: string | null | undefined): string | null {
  if (!input || typeof input !== 'string') return null;

  // 1. Strip all non-digit characters except leading '+' if present
  let cleaned = input.trim();
  const hasPlus = cleaned.startsWith('+');
  let digits = cleaned.replace(/\D/g, '');

  if (!digits) return null;

  // 2. Handle country code prefix '251'
  if (digits.startsWith('251')) {
    digits = digits.substring(3);
  }

  // 3. Handle local leading zero '0'
  if (digits.startsWith('0')) {
    digits = digits.substring(1);
  }

  // 4. An Ethiopian mobile number must now be exactly 9 digits and start with 9 or 7
  // Ethio Telecom: 9XXXXXXXX
  // Safaricom Ethiopia: 7XXXXXXXX
  if (digits.length === 9 && (digits.startsWith('9') || digits.startsWith('7'))) {
    return `+251${digits}`;
  }

  return null;
}

export function isValidEthiopianPhone(input: string | null | undefined): boolean {
  return normalizeEthiopianPhone(input) !== null;
}

/**
 * Returns a masked phone number safe for logs and diagnostics
 * e.g. +251912345678 -> +25191***5678
 */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return '[NO_PHONE]';
  const norm = normalizeEthiopianPhone(phone);
  if (!norm) return '[INVALID_PHONE]';
  return `${norm.slice(0, 6)}***${norm.slice(-4)}`;
}

/**
 * Formats canonical E.164 phone into local standard format (e.g. 0912345678, or 0912 345 678 if spaced=true)
 */
export function formatLocalPhone(phone: string | null | undefined, spaced: boolean = false): string {
  const norm = normalizeEthiopianPhone(phone);
  if (!norm) return phone || '';
  const local9 = norm.slice(4); // removes '+251'
  if (spaced) {
    return `0${local9.slice(0, 3)} ${local9.slice(3, 6)} ${local9.slice(6)}`;
  }
  return `0${local9}`;
}
