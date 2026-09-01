import { describe, expect, it } from "vitest";

import type { InvoiceDetailView } from "../invoice.types";
import { InvoiceRendererService } from "./invoice-renderer.service";

function invoice(overrides: Partial<InvoiceDetailView> = {}): InvoiceDetailView {
  return {
    id: "inv-1",
    tenantId: "tenant-1",
    invoiceNumber: "INV-2026-08-000001",
    type: "STANDARD",
    status: "ISSUED",
    issueDate: "2026-08-22T00:00:00.000Z",
    saleDate: null,
    dueDate: "2026-09-05T00:00:00.000Z",
    sentAt: null,
    currency: "PLN",
    documentLanguage: "pl",
    customerId: "cust-1",
    rentalId: null,
    sourceQuoteId: null,
    bankAccountId: "bank-1",
    sellerSnapshot: {
      name: "Havelio Sp. z o.o.",
      taxNumber: "1234567890",
      address: "Warszawa",
      phone: "",
    },
    buyerSnapshot: { name: "Jan Kowalski", address: "Kraków", phone: "", email: "", taxNumber: "" },
    bankSnapshot: {
      label: "PLN",
      bankName: "PKO",
      iban: "PL00000000000000000000000000",
      swiftBic: "BPKOPLPW",
      currency: "PLN",
      accountNumber: "00 0000 0000 0000",
      bankAddress: "",
      paymentReference: "",
    },
    subtotalMinor: 80_000,
    discountMinor: 0,
    taxMinor: 18_400,
    totalMinor: 98_400,
    paidMinor: 0,
    remainingMinor: 98_400,
    paymentStatus: "UNPAID",
    percentagePaid: 0,
    isOverdue: false,
    overdueDays: 0,
    overdueAmountMinor: 0,
    preferredPaymentMethod: "BANK_TRANSFER",
    paymentReference: null,
    notes: null,
    eInvoiceStatus: "NOT_SENT",
    eInvoiceReferenceNumber: null,
    eInvoiceSubmittedAt: null,
    eInvoiceProcessedAt: null,
    eInvoiceError: null,
    createdByUserId: "user-1",
    updatedByUserId: null,
    createdAt: "2026-08-22T00:00:00.000Z",
    updatedAt: "2026-08-22T00:00:00.000Z",
    items: [
      {
        id: "item-1",
        description: "Generator A",
        quantity: 1,
        unit: null,
        unitNetPriceMinor: 80_000,
        discountMinor: 0,
        taxRateBp: 2300,
        netTotalMinor: 80_000,
        taxTotalMinor: 18_400,
        grossTotalMinor: 98_400,
        sortOrder: 0,
        sourceRentalItemId: null,
      },
    ],
    customer: null,
    rental: null,
    bankAccount: null,
    ...overrides,
  };
}

describe("InvoiceRendererService", () => {
  const renderer = new InvoiceRendererService();

  it("renders real Polish invoice terminology for a Polish-language invoice", () => {
    const { html } = renderer.render(invoice({ documentLanguage: "pl" }));

    expect(html).toContain("FAKTURA");
    expect(html).toContain("Numer faktury");
    expect(html).toContain("Data wystawienia");
    expect(html).toContain("Termin płatności");
    expect(html).toContain("Sprzedawca");
    expect(html).toContain("Nabywca");
    expect(html).toContain("Nazwa towaru/usługi");
    expect(html).toContain("Wartość netto");
    expect(html).toContain("Kwota VAT");
    expect(html).toContain("Wartość brutto");
    expect(html).toContain("Razem");
    expect(html).toContain("Do zapłaty");
    expect(html).toContain("Numer rachunku");
    expect(html).toContain("IBAN");
  });

  it("never mixes an English body with Polish table headers, or vice versa", () => {
    const polish = renderer.render(invoice({ documentLanguage: "pl" })).html;
    expect(polish).not.toContain("INVOICE");
    expect(polish).not.toContain("Invoice number");
    expect(polish).not.toContain("Due date");

    const english = renderer.render(invoice({ documentLanguage: "en" })).html;
    expect(english).toContain("INVOICE");
    expect(english).toContain("Invoice number");
    expect(english).toContain("Due date");
    expect(english).not.toContain("FAKTURA");
    expect(english).not.toContain("Numer faktury");
  });

  it("falls back to English for a language with no authored invoice strings", () => {
    const { html } = renderer.render(invoice({ documentLanguage: "de" }));
    expect(html).toContain("INVOICE");
  });

  it("shows a PROFORMA title for a proforma invoice", () => {
    const { html } = renderer.render(invoice({ documentLanguage: "en", type: "PROFORMA" }));
    expect(html).toContain("PROFORMA INVOICE");
  });

  it("HTML-escapes user-controlled snapshot data (customer name) to prevent injection", () => {
    const { html } = renderer.render(
      invoice({
        documentLanguage: "en",
        buyerSnapshot: {
          name: "<script>alert(1)</script>",
          address: "",
          phone: "",
          email: "",
          taxNumber: "",
        },
      }),
    );
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("renders bank IBAN/SWIFT and item net/tax/gross amounts formatted as currency", () => {
    const { html } = renderer.render(invoice());
    expect(html).toContain("PL00000000000000000000000000");
    expect(html).toContain("BPKOPLPW");
    expect(html).toContain("Generator A");
  });
});
