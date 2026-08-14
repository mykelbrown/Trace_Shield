// Identifier normalization — pure functions, fully unit-testable.

export function normalizeEmail(input: string): string {
  return input.trim().toLowerCase();
}

export function isValidEmail(input: string): boolean {
  // Pragmatic RFC 5322-ish check — good enough for OSINT query generation,
  // deliberately not a full grammar implementation.
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(input.trim());
}

export function emailDomain(input: string): string | undefined {
  const m = normalizeEmail(input).match(/@([^@]+)$/);
  return m?.[1];
}

/** Country calling codes we know how to reformat locally (extend as needed). */
const COUNTRY_TRUNK_PREFIX: Record<string, string> = {
  "353": "0", // Ireland
  "44": "0", // UK
  "33": "0", // France
  "49": "0", // Germany
  "1": "1", // US/Canada — no trunk prefix, NANP already starts with area code
};

export interface PhoneVariants {
  raw: string;
  e164: string; // +<countrycode><nationalnumber>, digits only after +
  international: string; // +CC NNN NNN NNN spaced
  national: string; // trunk-prefixed local format, e.g. 08XXXXXXXX
  digitsOnly: string;
  countryCode?: string;
}

export function isValidPhone(input: string): boolean {
  const digits = input.replace(/[^\d+]/g, "");
  const bare = digits.replace(/\D/g, "");
  return bare.length >= 7 && bare.length <= 15;
}

export function normalizePhone(input: string, defaultCountryCode = "353"): PhoneVariants {
  const trimmed = input.trim();
  let digits = trimmed.replace(/[^\d+]/g, "");
  let countryCode: string | undefined;
  let national: string;

  if (digits.startsWith("+")) {
    const bare = digits.slice(1);
    countryCode = Object.keys(COUNTRY_TRUNK_PREFIX)
      .sort((a, b) => b.length - a.length)
      .find((cc) => bare.startsWith(cc));
    national = countryCode ? bare.slice(countryCode.length) : bare;
  } else if (digits.startsWith("00")) {
    const bare = digits.slice(2);
    countryCode = Object.keys(COUNTRY_TRUNK_PREFIX)
      .sort((a, b) => b.length - a.length)
      .find((cc) => bare.startsWith(cc));
    national = countryCode ? bare.slice(countryCode.length) : bare;
  } else if (digits.startsWith("0")) {
    countryCode = defaultCountryCode;
    national = digits.slice(1);
  } else {
    countryCode = defaultCountryCode;
    national = digits;
  }

  const trunk = COUNTRY_TRUNK_PREFIX[countryCode ?? ""] ?? "0";
  const e164 = `+${countryCode ?? ""}${national}`;
  const groups = national.match(/.{1,3}/g) ?? [national];
  const international = `+${countryCode} ${groups.join(" ")}`;
  const nationalFormatted = `${trunk}${national}`;

  return {
    raw: trimmed,
    e164,
    international,
    national: nationalFormatted,
    digitsOnly: `${countryCode ?? ""}${national}`,
    countryCode,
  };
}

export function normalizeUsername(input: string): string {
  return input.trim().replace(/^@/, "");
}

const USERNAME_RE = /^[a-zA-Z0-9._-]{2,40}$/;
export function isValidUsername(input: string): boolean {
  return USERNAME_RE.test(normalizeUsername(input));
}

export function normalizeName(input: string): string {
  return input.trim().replace(/\s+/g, " ");
}

export function nameParts(input: string): { first?: string; middle?: string[]; last?: string } {
  const parts = normalizeName(input).split(" ").filter(Boolean);
  if (parts.length === 0) return {};
  if (parts.length === 1) return { first: parts[0] };
  return {
    first: parts[0],
    middle: parts.slice(1, -1),
    last: parts[parts.length - 1],
  };
}

export function isValidDomain(input: string): boolean {
  return /^(?!-)[a-zA-Z0-9-]{1,63}(?<!-)(\.[a-zA-Z0-9-]{1,63})+$/.test(input.trim());
}

export function normalizeDomain(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
}

/** Validates a URL is well-formed http(s) — used before any provider follows a link. */
export function isValidHttpUrl(input: string): boolean {
  try {
    const u = new URL(input);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function normalizeAddress(input: string): string {
  return input.trim().replace(/\s+/g, " ").replace(/,\s*,/g, ",");
}
