import type { EmailAttachment } from "./email.types";

/** The `cid:` reference used by every transactional email that embeds the tenant's company logo. */
export const COMPANY_LOGO_CID = "company-logo";

export interface LogoEmailParts {
  attachments: EmailAttachment[];
  /** A ready-to-splice `<img>` tag, or "" when no logo is configured — never a broken-image icon. */
  imgHtml: string;
}

/**
 * Havelio Company Branding (docs/PRODUCT_BIBLE.md) — turns the tenant's
 * logo bytes (or `null`, when none is configured) into the inline-CID
 * attachment and `<img src="cid:...">` tag every transactional email
 * (Quote/Document/Invoice) that shows branding needs. Never a raw R2 URL:
 * email clients cannot reach Havelio's private, authenticated storage
 * endpoints, so this is the only safe way to show a logo in outgoing
 * mail — see docs/DECISIONS.md.
 */
export function buildLogoEmailParts(logo: { buffer: Buffer; mimeType: string } | null): LogoEmailParts {
  if (!logo) return { attachments: [], imgHtml: "" };
  return {
    attachments: [
      { filename: "logo", content: logo.buffer, contentType: logo.mimeType, cid: COMPANY_LOGO_CID },
    ],
    imgHtml: `<img src="cid:${COMPANY_LOGO_CID}" alt="" style="max-height:48px;max-width:180px;display:block;margin-bottom:8px;" />`,
  };
}
