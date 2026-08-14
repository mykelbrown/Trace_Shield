import type { Seed } from "./types";
import { emailDomain, nameParts, normalizePhone } from "./normalize";

export interface GeneratedQuery {
  seedId: string;
  query: string;
  purpose: string;
}

const DOCUMENT_FILETYPES = ["pdf", "xlsx", "doc", "docx", "csv", "txt", "ppt", "pptx"];

export function generateEmailQueries(seed: Seed): GeneratedQuery[] {
  const email = seed.value;
  const base: [string, string][] = [
    [`"${email}"`, "direct mention"],
    [`"${email}" profile`, "profile association"],
    [`"${email}" account`, "account association"],
    [`"${email}" contact`, "contact listing"],
  ];
  const domain = emailDomain(email);
  if (domain) base.push([`"${email}" "${domain}"`, "business association"]);
  const docs = DOCUMENT_FILETYPES.map(
    (ft) => [`"${email}" filetype:${ft}`, `document exposure (${ft})`] as [string, string]
  );
  return [...base, ...docs].map(([query, purpose]) => ({ seedId: seed.id, query, purpose }));
}

export function generatePhoneQueries(seed: Seed): GeneratedQuery[] {
  const variants = normalizePhone(seed.value);
  const forms = [variants.e164, variants.digitsOnly, variants.national, variants.international];
  const unique = Array.from(new Set(forms));
  return unique.map((q) => ({ seedId: seed.id, query: `"${q}"`, purpose: "phone number appearance" }));
}

export function generateNameQueries(seed: Seed, context?: { city?: string; role?: string; employer?: string }): GeneratedQuery[] {
  const { first, middle, last } = nameParts(seed.value);
  const full = seed.value;
  const out: GeneratedQuery[] = [{ seedId: seed.id, query: `"${full}"`, purpose: "exact name match" }];
  if (first && middle?.length && last) {
    out.push({ seedId: seed.id, query: `"${first} ${middle.join(" ")} ${last}"`, purpose: "full name with middle" });
  }
  if (context?.city) out.push({ seedId: seed.id, query: `"${full}" ${context.city}`, purpose: "name + location" });
  if (context?.role) out.push({ seedId: seed.id, query: `"${full}" ${context.role}`, purpose: "name + profession" });
  if (context?.employer) out.push({ seedId: seed.id, query: `"${full}" "${context.employer}"`, purpose: "name + employer" });
  out.push({ seedId: seed.id, query: `"${full}" LinkedIn`, purpose: "professional profile" });
  DOCUMENT_FILETYPES.slice(0, 2).forEach((ft) =>
    out.push({ seedId: seed.id, query: `"${full}" filetype:${ft}`, purpose: `document exposure (${ft})` })
  );
  return out;
}

export function generateUsernameQueries(seed: Seed): GeneratedQuery[] {
  const u = seed.value;
  return [
    { seedId: seed.id, query: `"${u}"`, purpose: "exact username match" },
    { seedId: seed.id, query: `"${u}" profile`, purpose: "profile listing" },
    { seedId: seed.id, query: `"${u}" forum`, purpose: "forum activity" },
    { seedId: seed.id, query: `"${u}" github`, purpose: "developer presence" },
  ];
}

export function generateAddressQueries(seed: Seed): GeneratedQuery[] {
  const addr = seed.value;
  return [
    { seedId: seed.id, query: `"${addr}"`, purpose: "address indexing" },
    { seedId: seed.id, query: `"${addr}" filetype:pdf`, purpose: "document exposure" },
    { seedId: seed.id, query: `"${addr}" business`, purpose: "business registration" },
  ];
}

export function generateQueriesForSeed(seed: Seed, context?: Record<string, string>): GeneratedQuery[] {
  switch (seed.type) {
    case "email":
      return generateEmailQueries(seed);
    case "phone":
      return generatePhoneQueries(seed);
    case "name":
      return generateNameQueries(seed, context);
    case "username":
      return generateUsernameQueries(seed);
    case "address":
      return generateAddressQueries(seed);
    default:
      return [{ seedId: seed.id, query: `"${seed.value}"`, purpose: "generic exact match" }];
  }
}
