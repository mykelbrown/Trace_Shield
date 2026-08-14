import type { ExposureType, Finding, RemediationItem } from "./types";
import { newId } from "./ids";

const DEFAULT_ACTIONS: Record<ExposureType, string> = {
  email_exposed_publicly: "Consider requesting removal from the indexing site; use an alias email for public-facing signups.",
  email_associated_with_account: "Review the account's privacy settings; remove the email from any public profile field.",
  email_associated_with_business: "If this business listing is stale, update or delist it via the registrar/directory.",
  email_appears_in_document: "Contact the document owner/site admin to request removal or redaction.",
  email_appears_in_breach: "Change the password on the breached service and anywhere it was reused; enable MFA.",
  email_historical_result: "Low urgency — verify the page is truly stale; request archive removal if sensitive.",
  phone_exposed_publicly: "Request removal from the indexing/directory site; consider a secondary number for public use.",
  phone_business_association: "Update or remove the business listing if no longer accurate.",
  address_indexed_publicly: "Submit an opt-out/removal request to the data-broker or directory site indexing the address.",
  name_match: "Low urgency — verify identity match before taking action; monitor for higher-confidence exposures.",
  username_match: "Review the platform's privacy settings, or deactivate the account if no longer used.",
  social_profile: "Review profile visibility settings; remove sensitive fields (phone/email/location) from public view.",
  professional_profile: "Review what's public on this profile; ensure it doesn't overexpose current employer/location.",
  document_exposure: "Contact the hosting site to request removal; scrub metadata (author, path) before publishing docs.",
  breach_exposure: "Change the password, enable MFA, and check for credential reuse across other accounts.",
  code_repository_exposure: "Review repository for personal data or secrets; consider making history private or scrubbing commits.",
  potential_secret: "Rotate/revoke the credential immediately, then remove it from repository history.",
  domain_dns_exposure: "Review DNS/WHOIS privacy settings (enable WHOIS privacy where available).",
  subdomain_exposure: "Review whether the subdomain should remain publicly resolvable/indexed.",
  historical_archive: "Request removal from the web archive if the content is sensitive and no longer relevant.",
  source_unavailable: "Manually verify using the recommended method noted in this finding.",
};

export function recommendedActionFor(exposureType: ExposureType): string {
  return DEFAULT_ACTIONS[exposureType] ?? "Review this exposure manually and decide on an appropriate action.";
}

export function remediationFromFinding(finding: Finding, now: string): RemediationItem {
  return {
    id: newId("rem"),
    investigationId: finding.investigationId,
    findingId: finding.id,
    action: finding.recommendedAction || recommendedActionFor(finding.exposureType),
    status: "OPEN",
    createdAt: now,
    updatedAt: now,
  };
}
