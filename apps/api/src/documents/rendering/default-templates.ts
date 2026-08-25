import type { DocumentType } from "@prisma/client";

import type { SupportedLanguage } from "@rentos/localization";

/**
 * Built-in fallback templates (Part 9's "design system" deliverable) — used
 * by DocumentRendererService whenever a Document has no explicit
 * `templateId` and the tenant has no ACTIVE DocumentTemplate for that type
 * yet, so every document type is renderable out of the box without
 * per-tenant setup. These are plain constants, not database rows: a tenant
 * that wants to customize appearance creates a real DocumentTemplate (see
 * DocumentTemplatesService) and activates it, which then takes precedence.
 *
 * Every template below uses only the shared base stylesheet's class names
 * (see base-document.css) and the variable placeholders documented in ADR
 * 0011 — no document-type-specific columns or logic anywhere else in the
 * codebase depends on this content.
 *
 * Language: see DECISIONS.md D-071/D-075/D-077. The resolved document
 * language (company country first, never UI language) picks which of
 * `TEMPLATES_BY_LANGUAGE`'s authored sets to use — see `getDefaultTemplate`.
 * Content here is authored by hand per language, never machine-translated at
 * render time: a language with no entry for a given DocumentType falls back
 * to the English original rather than presenting an unfinished translation
 * as if it were real.
 */
export interface DefaultTemplate {
  title: string;
  htmlContent: string;
}

/** The literal strings a document shell/section needs, one set per authored language. */
interface DocumentStrings {
  partiesTitle: string;
  company: string;
  customer: string;
  representedBy: string;
  address: string;
  contact: string;
  asset: string;
  name: string;
  serial: string;
  category: string;
  location: string;
  notes: string;
  generatedWith: string;
  quoteTitle: string;
  quoteOfferSection: string;
  quoteTotal: string;
  subtotal: string;
  discount: string;
  tax: string;
  issueDateLabel: string;
  validUntilLabel: string;
  termsTitle: string;
  contractTitle: string;
  contractSubject: string;
  rentalPeriod: string;
  periodStart: string;
  periodEnd: string;
  price: string;
  rentalTotal: string;
  securityDeposit: string;
  amountDue: string;
  handoverTitle: string;
  handoverSubtitle: string;
  returnTitle: string;
  returnSubtitle: string;
  damageReportTitle: string;
  damageDescription: string;
  assetConditionLabel: string;
  newDamageLabel: string;
  missingItemsLabel: string;
  contractAmendmentTitle: string;
  amendmentTo: string;
  contractSections: { title: string; body: string }[];
}

function documentShell(
  strings: DocumentStrings,
  titleLine: string,
  subtitleLine: string,
  body: string,
): string {
  return `
<div class="doc-page">
  <div class="doc-header">
    <div class="doc-header__brand">
      {{company.logoHtml}}
      <div class="doc-header__company">{{company.name}}</div>
    </div>
    <div class="doc-header__meta">
      {{document.number}}<br />
      {{today}}
    </div>
  </div>

  <h1 class="doc-title">${titleLine}</h1>
  <p class="doc-subtitle">${subtitleLine}</p>

  ${body}

  <div class="doc-signature-row">
    <div class="doc-signature-block">
      <div class="doc-signature-block__label">${strings.company}</div>
      <div class="doc-signature-block__name">{{signature.company}}</div>
    </div>
    <div class="doc-signature-block">
      <div class="doc-signature-block__label">${strings.customer}</div>
      <div class="doc-signature-block__name">{{customer.name}}</div>
    </div>
  </div>

  <div class="doc-footer">
    <span>{{company.name}} · ${strings.generatedWith}</span>
    <span>{{document.number}} · {{today}}</span>
  </div>
</div>`.trim();
}

function partiesSection(strings: DocumentStrings): string {
  return `
  <div class="doc-section">
    <div class="doc-section__title">${strings.partiesTitle}</div>
    <div class="doc-grid">
      <div>
        <div class="doc-field"><div class="doc-field__label">${strings.company}</div><div class="doc-field__value">{{company.name}}</div></div>
        <div class="doc-field"><div class="doc-field__label">${strings.representedBy}</div><div class="doc-field__value">{{employee.name}}</div></div>
      </div>
      <div>
        <div class="doc-field"><div class="doc-field__label">${strings.customer}</div><div class="doc-field__value">{{customer.name}}</div></div>
        <div class="doc-field"><div class="doc-field__label">${strings.address}</div><div class="doc-field__value">{{customer.address}}</div></div>
        <div class="doc-field"><div class="doc-field__label">${strings.contact}</div><div class="doc-field__value">{{customer.email}} · {{customer.phone}}</div></div>
      </div>
    </div>
  </div>`;
}

function assetSection(strings: DocumentStrings): string {
  return `
  <div class="doc-section">
    <div class="doc-section__title">${strings.asset}</div>
    <table class="doc-table">
      <thead><tr><th>${strings.name}</th><th>${strings.serial}</th><th>${strings.category}</th><th>${strings.location}</th></tr></thead>
      <tbody><tr><td>{{asset.name}}</td><td>{{asset.serial}}</td><td>{{asset.category}}</td><td>{{asset.location}}</td></tr></tbody>
    </table>
  </div>`;
}

function notesSection(strings: DocumentStrings): string {
  return `
  <div class="doc-section">
    <div class="doc-section__title">${strings.notes}</div>
    <p class="doc-notes">{{notes}}</p>
  </div>`;
}

/**
 * Generic, tenant-editable clause text, not jurisdiction-specific legal
 * advice — see PRODUCT_BIBLE §28's existing scope boundary (Havelio ships
 * a customizable business document, never a guaranteed-compliant legal
 * contract). Every tenant can edit this content freely once the no-code
 * builder ships; this is the starting point, not a final text.
 */
function contractClauseSection(title: string, bodyHtml: string): string {
  return `
  <div class="doc-section">
    <div class="doc-section__title">${title}</div>
    ${bodyHtml}
  </div>`;
}

/** The 18-section professional Rental Contract body — see docs/UI_REDESIGN_PLAN.md Pre-Chapter 10 section. */
function rentalContractBody(strings: DocumentStrings): string {
  const clauses = strings.contractSections
    .map((section) =>
      contractClauseSection(section.title, `<p class="doc-clause">${section.body}</p>`),
    )
    .join("\n  ");

  return `${partiesSection(strings)}
  <div class="doc-section">
    <div class="doc-section__title">${strings.contractSubject}</div>
    {{rental.assetsTableHtml}}
    {{quote.servicesTableHtml}}
  </div>
  <div class="doc-section">
    <div class="doc-section__title">${strings.rentalPeriod}</div>
    <div class="doc-card">
      <div class="doc-grid">
        <div class="doc-field"><div class="doc-field__label">${strings.periodStart}</div><div class="doc-field__value">{{rental.startDateTime}}</div></div>
        <div class="doc-field"><div class="doc-field__label">${strings.periodEnd}</div><div class="doc-field__value">{{rental.endDateTime}}</div></div>
      </div>
    </div>
  </div>
  <div class="doc-section">
    <div class="doc-section__title">${strings.price}</div>
    <div class="doc-card">
      <div class="doc-grid">
        <div class="doc-field"><div class="doc-field__label">${strings.rentalTotal}</div><div class="doc-field__value">{{rental.total}}</div></div>
        <div class="doc-field"><div class="doc-field__label">${strings.securityDeposit}</div><div class="doc-field__value">{{rental.deposit}}</div></div>
        <div class="doc-field"><div class="doc-field__label">${strings.amountDue}</div><div class="doc-field__value">{{rental.amountDue}}</div></div>
      </div>
    </div>
  </div>
  ${clauses}`;
}

function buildTemplates(strings: DocumentStrings): Record<DocumentType, DefaultTemplate> {
  return {
    QUOTE: {
      title: strings.quoteTitle,
      htmlContent: documentShell(
        strings,
        strings.quoteTitle,
        "{{quote.number}}",
        `${partiesSection(strings)}
  <div class="doc-section">
    <div class="doc-section__title">${strings.quoteOfferSection}</div>
    {{rental.assetsTableHtml}}
    {{quote.servicesTableHtml}}
    <div class="doc-card">
      <div class="doc-grid">
        <div class="doc-field"><div class="doc-field__label">${strings.issueDateLabel}</div><div class="doc-field__value">{{quote.issueDate}}</div></div>
        <div class="doc-field"><div class="doc-field__label">${strings.validUntilLabel}</div><div class="doc-field__value">{{quote.validUntil}}</div></div>
      </div>
    </div>
  </div>
  <div class="doc-section">
    <div class="doc-section__title">${strings.rentalPeriod}</div>
    <div class="doc-card">
      <div class="doc-grid">
        <div class="doc-field"><div class="doc-field__label">${strings.periodStart}</div><div class="doc-field__value">{{rental.startDateTime}}</div></div>
        <div class="doc-field"><div class="doc-field__label">${strings.periodEnd}</div><div class="doc-field__value">{{rental.endDateTime}}</div></div>
      </div>
    </div>
  </div>
  <div class="doc-section">
    <div class="doc-section__title">${strings.price}</div>
    <div class="doc-card">
      <div class="doc-grid">
        <div class="doc-field"><div class="doc-field__label">${strings.subtotal}</div><div class="doc-field__value">{{rental.subtotal}}</div></div>
        <div class="doc-field"><div class="doc-field__label">${strings.discount}</div><div class="doc-field__value">{{rental.discount}}</div></div>
        <div class="doc-field"><div class="doc-field__label">${strings.tax}</div><div class="doc-field__value">{{rental.tax}}</div></div>
        <div class="doc-field"><div class="doc-field__label">${strings.quoteTotal}</div><div class="doc-field__value">{{rental.total}}</div></div>
        <div class="doc-field"><div class="doc-field__label">${strings.securityDeposit}</div><div class="doc-field__value">{{rental.deposit}}</div></div>
        <div class="doc-field"><div class="doc-field__label">${strings.amountDue}</div><div class="doc-field__value">{{rental.amountDue}}</div></div>
      </div>
    </div>
  </div>
  ${notesSection(strings)}
  <div class="doc-section">
    <div class="doc-section__title">${strings.termsTitle}</div>
    <p class="doc-notes">{{quote.terms}}</p>
  </div>`,
      ),
    },
    CONTRACT: {
      title: strings.contractTitle,
      htmlContent: documentShell(
        strings,
        strings.contractTitle,
        "{{rental.number}}",
        rentalContractBody(strings),
      ),
    },
    HANDOVER_PROTOCOL: {
      title: strings.handoverTitle,
      htmlContent: documentShell(
        strings,
        strings.handoverTitle,
        strings.handoverSubtitle,
        `${partiesSection(strings)}${assetSection(strings)}${notesSection(strings)}
  <div class="doc-section">
    <div class="doc-section__title">${strings.assetConditionLabel}</div>
    <p class="doc-notes">{{data.conditionNotes.assetCondition}}</p>
  </div>
  <div class="doc-section">
    <div class="doc-section__title">${strings.damageDescription}</div>
    <p class="doc-notes">{{data.conditionNotes.damageDescription}}</p>
  </div>`,
      ),
    },
    RETURN_PROTOCOL: {
      title: strings.returnTitle,
      htmlContent: documentShell(
        strings,
        strings.returnTitle,
        strings.returnSubtitle,
        `${partiesSection(strings)}${assetSection(strings)}${notesSection(strings)}
  <div class="doc-section">
    <div class="doc-section__title">${strings.assetConditionLabel}</div>
    <p class="doc-notes">{{data.conditionNotes.assetCondition}}</p>
  </div>
  <div class="doc-section">
    <div class="doc-section__title">${strings.newDamageLabel}</div>
    <p class="doc-notes">{{data.conditionNotes.damageDescription}}</p>
  </div>
  <div class="doc-section">
    <div class="doc-section__title">${strings.missingItemsLabel}</div>
    <p class="doc-notes">{{data.conditionNotes.missingItems}}</p>
  </div>`,
      ),
    },
    DAMAGE_REPORT: {
      title: strings.damageReportTitle,
      htmlContent: documentShell(
        strings,
        strings.damageReportTitle,
        "{{asset.name}} — {{today}}",
        `${assetSection(strings)}
  <div class="doc-section">
    <div class="doc-section__title">${strings.damageDescription}</div>
    <p class="doc-notes">{{notes}}</p>
  </div>`,
      ),
    },
    CONTRACT_AMENDMENT: {
      title: strings.contractAmendmentTitle,
      htmlContent: documentShell(
        strings,
        strings.contractAmendmentTitle,
        `${strings.amendmentTo} {{rental.number}}`,
        `${partiesSection(strings)}${notesSection(strings)}`,
      ),
    },
    CUSTOM: {
      title: "Document",
      htmlContent: documentShell(
        strings,
        "{{document.title}}",
        "{{document.number}}",
        notesSection(strings),
      ),
    },
  };
}

const EN_STRINGS: DocumentStrings = {
  partiesTitle: "Parties",
  company: "Company",
  customer: "Customer",
  representedBy: "Represented by",
  address: "Address",
  contact: "Contact",
  asset: "Asset",
  name: "Name",
  serial: "Serial",
  category: "Category",
  location: "Location",
  notes: "Notes",
  generatedWith: "Generated with Havelio",
  quoteTitle: "Commercial Offer",
  quoteOfferSection: "Offer",
  quoteTotal: "Total",
  subtotal: "Subtotal",
  discount: "Discount",
  tax: "Tax",
  issueDateLabel: "Issue date",
  validUntilLabel: "Valid until",
  termsTitle: "Terms and conditions",
  contractTitle: "Rental Contract",
  contractSubject: "Subject of the Contract — Rented Assets",
  rentalPeriod: "Rental Period",
  periodStart: "Start",
  periodEnd: "End",
  price: "Price",
  rentalTotal: "Rental total",
  securityDeposit: "Security deposit",
  amountDue: "Amount due at start",
  handoverTitle: "Handover Protocol",
  handoverSubtitle: "Condition recorded at handover",
  returnTitle: "Return Protocol",
  returnSubtitle: "Condition recorded at return",
  damageReportTitle: "Damage Report",
  damageDescription: "Damage description",
  assetConditionLabel: "Asset condition",
  newDamageLabel: "New damage",
  missingItemsLabel: "Missing items / accessories",
  contractAmendmentTitle: "Contract Amendment",
  amendmentTo: "Amendment to",
  contractSections: [
    {
      title: "Payment Terms",
      body: "The Customer agrees to pay the Rental total of {{rental.total}} according to the payment schedule agreed with {{company.name}}. Any security deposit stated above is held for the duration of the rental and is refundable subject to the return conditions described below.",
    },
    {
      title: "Delivery and Handover",
      body: "The rented assets are handed over to the Customer at the start of the Rental Period in the condition recorded in the accompanying Handover Protocol, if one is issued. The Customer is responsible for inspecting the assets at handover and reporting any pre-existing damage immediately.",
    },
    {
      title: "Return",
      body: "The Customer must return the rented assets to {{company.name}} by the End of the Rental Period stated above, in the same condition as received, ordinary wear and tear excepted. Condition at return is recorded in the accompanying Return Protocol, if one is issued.",
    },
    {
      title: "Customer Responsibilities",
      body: "The Customer shall use the rented assets only for their intended purpose, in accordance with any operating instructions provided, and shall not sublet, lend, or transfer the assets to any third party without {{company.name}}'s prior written consent.",
    },
    {
      title: "Damage and Loss",
      body: "The Customer is responsible for any damage to or loss of the rented assets occurring during the Rental Period, beyond ordinary wear and tear, and agrees to reimburse {{company.name}} for repair or replacement costs as documented in a Damage Report.",
    },
    {
      title: "Late Return",
      body: "If the rented assets are not returned by the End of the Rental Period, {{company.name}} may charge an additional fee for each day of late return, and reserves the right to recover the assets at the Customer's expense.",
    },
    {
      title: "Non-Payment",
      body: "If any amount due under this Contract is not paid when due, {{company.name}} reserves the right to suspend the rental, withhold the security deposit, and pursue collection of the outstanding balance.",
    },
    {
      title: "Termination",
      body: "Either party may terminate this Contract early by written notice in the event the other party materially breaches its obligations under this Contract and fails to remedy that breach within a reasonable period after notice.",
    },
    {
      title: "Additional Costs",
      body: "Costs not included in the Rental total above — such as delivery, collection, fuel, cleaning, or consumables — are the Customer's responsibility and will be invoiced separately unless otherwise agreed in writing.",
    },
    {
      title: "Notices",
      body: "Any notice under this Contract shall be sent to {{company.name}} at {{company.address}} or to the Customer at the address stated above.",
    },
    {
      title: "Applicable Terms and Jurisdiction",
      body: "This Contract is governed by the terms agreed between the parties. Any dispute arising from this Contract shall be resolved in accordance with the jurisdiction applicable to {{company.name}}, as customized by {{company.name}} for this template.",
    },
    {
      title: "Additional Conditions",
      body: 'Any additional conditions specific to this rental can be added here.</p>\n    <p class="doc-notes">{{notes}}',
    },
  ],
};

/**
 * Authored Polish business-document prose (not machine-translated at render
 * time — see DECISIONS.md D-077). Legal register matched to standard Polish
 * "umowa najmu" phrasing while keeping the same generic, tenant-editable
 * scope boundary as the English original (PRODUCT_BIBLE §28).
 */
const PL_STRINGS: DocumentStrings = {
  partiesTitle: "Strony",
  company: "Wynajmujący",
  customer: "Najemca",
  representedBy: "Reprezentowany przez",
  address: "Adres",
  contact: "Kontakt",
  asset: "Sprzęt",
  name: "Nazwa",
  serial: "Numer seryjny",
  category: "Kategoria",
  location: "Lokalizacja",
  notes: "Uwagi",
  generatedWith: "Wygenerowano w Havelio",
  quoteTitle: "Oferta handlowa",
  quoteOfferSection: "Oferta",
  quoteTotal: "Razem",
  subtotal: "Suma częściowa",
  discount: "Rabat",
  tax: "Podatek",
  issueDateLabel: "Data wystawienia",
  validUntilLabel: "Ważna do",
  termsTitle: "Warunki",
  contractTitle: "Umowa najmu",
  contractSubject: "Przedmiot umowy — wynajmowany sprzęt",
  rentalPeriod: "Okres najmu",
  periodStart: "Początek",
  periodEnd: "Koniec",
  price: "Cena",
  rentalTotal: "Wartość najmu",
  securityDeposit: "Kaucja zabezpieczająca",
  amountDue: "Kwota do zapłaty na start",
  handoverTitle: "Protokół wydania",
  handoverSubtitle: "Stan sprzętu odnotowany przy wydaniu",
  returnTitle: "Protokół zwrotu",
  returnSubtitle: "Stan sprzętu odnotowany przy zwrocie",
  damageReportTitle: "Zgłoszenie szkody",
  damageDescription: "Opis uszkodzenia",
  assetConditionLabel: "Stan sprzętu",
  newDamageLabel: "Nowe uszkodzenia",
  missingItemsLabel: "Brakujące elementy / akcesoria",
  contractAmendmentTitle: "Aneks do umowy",
  amendmentTo: "Aneks do umowy",
  contractSections: [
    {
      title: "Warunki płatności",
      body: "Najemca zobowiązuje się zapłacić wartość najmu w wysokości {{rental.total}} zgodnie z harmonogramem płatności uzgodnionym z {{company.name}}. Ewentualna kaucja zabezpieczająca wskazana powyżej jest przechowywana przez cały okres najmu i podlega zwrotowi zgodnie z warunkami zwrotu opisanymi poniżej.",
    },
    {
      title: "Dostawa i wydanie",
      body: "Wynajmowany sprzęt zostaje wydany Najemcy na początku okresu najmu w stanie odnotowanym w załączonym Protokole wydania, jeśli taki protokół zostanie sporządzony. Najemca jest zobowiązany do sprawdzenia sprzętu przy wydaniu i niezwłocznego zgłoszenia wszelkich wcześniej istniejących uszkodzeń.",
    },
    {
      title: "Zwrot",
      body: "Najemca zobowiązany jest zwrócić wynajmowany sprzęt {{company.name}} najpóźniej w dniu zakończenia okresu najmu wskazanym powyżej, w stanie niepogorszonym ponad normalne zużycie eksploatacyjne. Stan sprzętu przy zwrocie odnotowywany jest w załączonym Protokole zwrotu, jeśli taki protokół zostanie sporządzony.",
    },
    {
      title: "Obowiązki Najemcy",
      body: "Najemca zobowiązuje się używać wynajmowanego sprzętu wyłącznie zgodnie z jego przeznaczeniem oraz zgodnie z przekazaną instrukcją obsługi, jak również zobowiązuje się nie oddawać sprzętu w podnajem, użyczenie ani nie przekazywać go osobom trzecim bez uprzedniej pisemnej zgody {{company.name}}.",
    },
    {
      title: "Uszkodzenia i utrata",
      body: "Najemca ponosi odpowiedzialność za wszelkie uszkodzenia lub utratę wynajmowanego sprzętu powstałe w okresie najmu, ponad normalne zużycie eksploatacyjne, i zobowiązuje się zwrócić {{company.name}} koszty naprawy lub wymiany udokumentowane w Zgłoszeniu szkody.",
    },
    {
      title: "Opóźniony zwrot",
      body: "W przypadku niezwrócenia wynajmowanego sprzętu w terminie zakończenia okresu najmu, {{company.name}} może naliczyć dodatkową opłatę za każdy dzień opóźnienia oraz zastrzega sobie prawo do odbioru sprzętu na koszt Najemcy.",
    },
    {
      title: "Brak płatności",
      body: "W przypadku braku zapłaty jakiejkolwiek należności wynikającej z niniejszej umowy w terminie, {{company.name}} zastrzega sobie prawo do zawieszenia najmu, zatrzymania kaucji zabezpieczającej oraz dochodzenia zaległej należności.",
    },
    {
      title: "Rozwiązanie umowy",
      body: "Każda ze stron może rozwiązać niniejszą umowę przed terminem poprzez pisemne wypowiedzenie, w przypadku gdy druga strona istotnie naruszy swoje zobowiązania wynikające z umowy i nie usunie tego naruszenia w rozsądnym terminie po otrzymaniu wypowiedzenia.",
    },
    {
      title: "Koszty dodatkowe",
      body: "Koszty nieujęte w wartości najmu powyżej — takie jak dostawa, odbiór, paliwo, czyszczenie lub materiały eksploatacyjne — obciążają Najemcę i zostaną zafakturowane osobno, chyba że strony uzgodnią inaczej na piśmie.",
    },
    {
      title: "Zawiadomienia",
      body: "Wszelkie zawiadomienia wynikające z niniejszej umowy należy kierować do {{company.name}} na adres {{company.address}} lub do Najemcy na adres wskazany powyżej.",
    },
    {
      title: "Postanowienia końcowe i właściwość prawa",
      body: "Niniejsza umowa podlega warunkom uzgodnionym pomiędzy stronami. Wszelkie spory wynikające z niniejszej umowy będą rozstrzygane zgodnie z jurysdykcją właściwą dla {{company.name}}, dostosowaną przez {{company.name}} do niniejszego szablonu.",
    },
    {
      title: "Warunki dodatkowe",
      body: 'Dodatkowe warunki właściwe dla niniejszego najmu można dodać w tym miejscu.</p>\n    <p class="doc-notes">{{notes}}',
    },
  ],
};

/** Every DocumentType, authored in English — the universal fallback for any language with no authored set. */
export const DEFAULT_TEMPLATES: Record<DocumentType, DefaultTemplate> = buildTemplates(EN_STRINGS);

/**
 * Authored language sets beyond English. Deliberately partial per language —
 * a DocumentType with no authored translation for a given language falls
 * back to `DEFAULT_TEMPLATES` (English) rather than fabricating one (see
 * DECISIONS.md D-077 — no runtime machine translation of legal/business
 * text). Add a new language here only once its content has genuinely been
 * authored, not merely stubbed.
 */
const TEMPLATES_BY_LANGUAGE: Partial<
  Record<SupportedLanguage, Record<DocumentType, DefaultTemplate>>
> = {
  pl: buildTemplates(PL_STRINGS),
};

/**
 * Resolves the built-in fallback template for one (documentType, language)
 * pair — the language here is always the already-resolved document
 * language (company country first; see resolveDefaultDocumentLanguage),
 * never the viewer's UI language. Falls back to the English original when
 * no content has been authored yet for the requested language, rather than
 * silently mixing an unauthored language's table labels into an English
 * body (see DECISIONS.md D-075, the bug this replaced).
 */
export function getDefaultTemplate(
  documentType: DocumentType,
  language: SupportedLanguage,
): DefaultTemplate {
  return TEMPLATES_BY_LANGUAGE[language]?.[documentType] ?? DEFAULT_TEMPLATES[documentType];
}
