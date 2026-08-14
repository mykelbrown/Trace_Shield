// Secret detection & redaction. DFI must never store or display raw secrets —
// only the category and location of a potential secret.

export interface SecretMatch {
  type: string;
  risk: "CRITICAL" | "HIGH";
  index: number;
  length: number;
}

interface SecretPattern {
  type: string;
  risk: "CRITICAL" | "HIGH";
  regex: RegExp;
}

// Order matters: more specific patterns first.
const SECRET_PATTERNS: SecretPattern[] = [
  { type: "AWS Access Key", risk: "CRITICAL", regex: /\bAKIA[0-9A-Z]{16}\b/g },
  { type: "AWS Secret Key", risk: "CRITICAL", regex: /\b(?:aws_secret_access_key|secret_key)\s*[:=]\s*['"]?[A-Za-z0-9/+=]{40}['"]?/gi },
  { type: "GitHub Token", risk: "CRITICAL", regex: /\bgh[pousr]_[A-Za-z0-9]{36,255}\b/g },
  { type: "Slack Token", risk: "CRITICAL", regex: /\bxox[baprs]-[A-Za-z0-9-]{10,72}\b/g },
  { type: "Google API Key", risk: "HIGH", regex: /\bAIza[0-9A-Za-z\-_]{35}\b/g },
  { type: "Stripe Key", risk: "CRITICAL", regex: /\b(?:sk|pk|rk)_(?:live|test)_[0-9a-zA-Z]{16,}\b/g },
  { type: "Private Key Block", risk: "CRITICAL", regex: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g },
  { type: "JWT", risk: "HIGH", regex: /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g },
  { type: "Generic API Key/Secret Assignment", risk: "HIGH", regex: /\b(api[_-]?key|api[_-]?secret|access[_-]?token|auth[_-]?token|client[_-]?secret|password)\s*[:=]\s*['"]?[A-Za-z0-9_\-.]{12,}['"]?/gi },
  { type: "Password Hash (bcrypt/argon)", risk: "CRITICAL", regex: /\$(2[aby]|argon2(?:i|id)?)\$[^\s'"]{20,}/g },
  { type: "Database Connection String", risk: "CRITICAL", regex: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^\s'"]+:[^\s'"]+@[^\s'"]+/gi },
];

export function detectSecrets(text: string): SecretMatch[] {
  const matches: SecretMatch[] = [];
  for (const pattern of SECRET_PATTERNS) {
    pattern.regex.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.regex.exec(text))) {
      matches.push({ type: pattern.type, risk: pattern.risk, index: m.index, length: m[0].length });
      if (!pattern.regex.global) break;
    }
  }
  return matches;
}

/** Replaces any detected secret substrings with a fixed-width redaction marker. */
export function redactSecrets(text: string): { redacted: string; found: SecretMatch[] } {
  const found = detectSecrets(text);
  if (found.length === 0) return { redacted: text, found };
  // Redact from the end so indices stay valid.
  let out = text;
  for (const match of [...found].sort((a, b) => b.index - a.index)) {
    out = out.slice(0, match.index) + `[REDACTED:${match.type}]` + out.slice(match.index + match.length);
  }
  return { redacted: out, found };
}

/** Masks an identifier for display purposes (e.g. "j***@example.com"). */
export function maskIdentifier(value: string, type: string): string {
  if (type === "email") {
    const [user, domain] = value.split("@");
    if (!domain) return maskGeneric(value);
    const visible = user.slice(0, Math.min(2, user.length));
    return `${visible}${"*".repeat(Math.max(1, user.length - visible.length))}@${domain}`;
  }
  if (type === "phone") {
    const digits = value.replace(/\D/g, "");
    return `${"*".repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
  }
  return maskGeneric(value);
}

function maskGeneric(value: string): string {
  if (value.length <= 4) return "*".repeat(value.length);
  return `${value.slice(0, 2)}${"*".repeat(value.length - 4)}${value.slice(-2)}`;
}
