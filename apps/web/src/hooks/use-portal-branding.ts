/**
 * Havelio Company Branding (docs/PRODUCT_BIBLE.md) — the tenant company's
 * own logo, shown in the Customer Portal so the customer understands whose
 * document/rental they're viewing. The portal session (its auth cookie)
 * determines which tenant's logo this resolves to server-side — no
 * tenantId param, unlike the staff-side companyLogoFileUrl().
 */
export function portalLogoFileUrl(): string {
  return `${process.env.NEXT_PUBLIC_API_URL}/portal/branding/logo/file`;
}
