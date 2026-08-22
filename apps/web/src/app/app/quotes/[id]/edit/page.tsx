"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@rentos/ui";
import { useParams, useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";

import { QuoteWizard } from "../../../../../components/quotes/quote-wizard";
import { useCurrentTenantId } from "../../../../../hooks/use-current-tenant";
import { useQuote, useUpdateQuote, type QuoteInput } from "../../../../../hooks/use-quotes";
import { apiErrorMessage } from "../../../../../lib/api-error-i18n";
import { fromMinorUnits } from "../../../../../lib/money";
import type { QuoteItemFormValues } from "../../../../../lib/validation";

export default function EditQuotePage() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [tenantId] = useCurrentTenantId();
  const { data: quote, isLoading } = useQuote(tenantId, params.id);
  const updateQuote = useUpdateQuote(tenantId);

  async function handleSubmit(input: QuoteInput): Promise<void> {
    await updateQuote.mutateAsync({ id: params.id, input });
    router.push(`/app/quotes/${params.id}`);
  }

  if (isLoading || !quote) {
    return <p className="text-muted-foreground text-sm">{t("common.loading")}</p>;
  }

  if (quote.status !== "DRAFT") {
    return <p className="text-destructive text-sm">{t("quote.errors.onlyDraftEditable")}</p>;
  }

  const initialItems: QuoteItemFormValues[] = quote.items.map((item) => ({
    itemType: item.itemType,
    assetId: item.assetId ?? "",
    name: item.name,
    description: item.description ?? "",
    quantity: item.quantity,
    unit: item.unit ?? "",
    billingMode: item.billingMode,
    unitPriceDisplay: fromMinorUnits(item.unitPriceMinor),
    dailyPriceDisplay: fromMinorUnits(item.dailyPriceMinor),
    weeklyPriceDisplay: fromMinorUnits(item.weeklyPriceMinor),
    monthlyPriceDisplay: fromMinorUnits(item.monthlyPriceMinor),
    customPriceDisplay: fromMinorUnits(item.customPriceMinor),
    discountType: item.discountType,
    discountValueDisplay: item.discountValue ? String(item.discountValue / 100) : "",
    taxRateDisplay: item.taxRateBp ? String(item.taxRateBp / 100) : "",
    depositDisplay: fromMinorUnits(item.depositMinor),
    notes: item.notes ?? "",
    partialMonthPolicy: item.partialMonthPolicy ?? "PRORATE_BY_DAY",
  }));

  return (
    <div className="flex justify-center">
      <Card className="w-full max-w-4xl">
        <CardHeader>
          <CardTitle>{t("quote.editQuote")}</CardTitle>
        </CardHeader>
        <CardContent>
          <QuoteWizard
            tenantId={tenantId}
            defaultCurrency={quote.currency}
            submitLabelKey="quote.save"
            initialValues={{
              customerId: quote.customerId,
              plannedStart: quote.plannedStart.slice(0, 16),
              plannedEnd: quote.plannedEnd.slice(0, 16),
              validUntil: quote.validUntil.slice(0, 16),
              currency: quote.currency,
              discountType: quote.discountType,
              discountValueDisplay: quote.discountValue ? String(quote.discountValue / 100) : "",
              customerNotes: quote.customerNotes ?? "",
              internalNotes: quote.internalNotes ?? "",
              termsAndConditions: quote.termsAndConditions ?? "",
            }}
            initialItems={initialItems}
            onSubmit={handleSubmit}
            isPending={updateQuote.isPending}
            errorMessage={
              updateQuote.isError ? apiErrorMessage(updateQuote.error, t("common.error")) : null
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
