// Synchronized directly with firebase-blueprint.json constraints

export const ADMIN_EMAIL = 'automaticstrong@gmail.com';

export function isAdminEmail(email?: string | null): boolean {
  return Boolean(email && email.trim().toLowerCase() === ADMIN_EMAIL);
}

export const VALIDATION_RULES = {
  ID_PATTERN: /^[a-zA-Z0-9_-]+$/,
  ID_MAX_LENGTH: 128,
  IBAN_PATTERN: /^VA[0-9]{16}$/,
  IBAN_LENGTH: 18,
  DISPLAY_NAME_MIN: 1,
  DISPLAY_NAME_MAX: 60,
  NOTE_MAX: 140,
  MIN_TRANSFER_CENTS: 1,
  LARGE_TRANSFER_THRESHOLD_CENTS: 10_000, // €100.00 FaceID threshold
  MAX_TRANSFER_CENTS: 10_000_000, // €100,000.00
  MAX_ADMIN_TRANSFER_CENTS: 100_000_000_000, // €1,000,000,000.00
  MAX_ACCOUNT_BALANCE_CENTS: 100_000_000, // €1,000,000.00
  WELCOME_BONUS_CENTS: 100_000, // €1,000.00
  TOPUP_AMOUNT_CENTS: 50_000, // €500.00
} as const;

export function normalizeIban(raw: string): string {
  return raw.replace(/\s+/g, '').toUpperCase();
}

export function formatIban(iban: string): string {
  const clean = normalizeIban(iban);
  return clean.replace(/(.{4})/g, '$1 ').trim();
}

export function isValidIban(iban: string): boolean {
  const clean = normalizeIban(iban);
  return (
    clean.length === VALIDATION_RULES.IBAN_LENGTH &&
    VALIDATION_RULES.IBAN_PATTERN.test(clean)
  );
}

export function sanitizeDisplayName(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, ' ');
  return trimmed.slice(0, VALIDATION_RULES.DISPLAY_NAME_MAX) || 'Valo Member';
}

export function sanitizeNote(note: string): string {
  return note.trim().slice(0, VALIDATION_RULES.NOTE_MAX);
}

export function parseEuroAmountToCents(input: string, isAdmin = false): number | null {
  const normalized = input.replace(',', '.').trim();
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    return null;
  }
  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  const cents = Math.round(value * 100);
  const maxCents = isAdmin
    ? VALIDATION_RULES.MAX_ADMIN_TRANSFER_CENTS
    : VALIDATION_RULES.MAX_TRANSFER_CENTS;
  if (cents < VALIDATION_RULES.MIN_TRANSFER_CENTS || cents > maxCents) {
    return null;
  }
  return cents;
}

export function formatEurFromCents(cents: number, options?: { showSign?: boolean; isCredit?: boolean }): string {
  const absFormatted = new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(cents) / 100);

  if (options?.showSign) {
    return options.isCredit ? `+${absFormatted}` : `-${absFormatted}`;
  }
  return cents < 0 ? `-${absFormatted}` : absFormatted;
}

export function generateCandidateIban(): string {
  const digits = new Uint8Array(14);
  crypto.getRandomValues(digits);
  let suffix = '';
  for (let i = 0; i < 14; i += 1) {
    suffix += String(digits[i] % 10);
  }
  return `VA42${suffix}`;
}

export function generateTxId(prefix: string = 'tx'): string {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${prefix}_${Date.now()}_${hex}`;
}
