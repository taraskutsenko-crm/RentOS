"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@rentos/ui";
import { useParams, useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";

import { RentalWizard } from "../../../../../components/rentals/rental-wizard";
import { useRental, useUpdateRental, type RentalInput } from "../../../../../hooks/use-rentals";
import { useCurrentTenantId } from "../../../../../hooks/use-current-tenant";
import { apiErrorMessage } from "../../../../../lib/api-error-i18n";
import { fromMinorUnits } from "../../../../../lib/money";
import type { RentalItemFormValues } from "../../../../../lib/validation";

export default function EditRentalPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [tenantId] = useCurrentTenantId();
  const { data: rental, isLoading } = useRental(tenantId, params.id);
  const updateRental = useUpdateRental(tenantId);

  async function handleSubmit(input: RentalInput): Promise<void> {
    await updateRental.mutateAsync({ id: params.id, input });
    router.push(`/app/rentals/${params.id}`);
  }

  if (isLoading || !rental) {
    return <p className="text-muted-foreground text-sm">{t("common.loading")}</p>;
  }

  const initialItems: RentalItemFormValues[] = rental.items.map((item) => ({
    assetId: item.assetId,
    billingMode: item.billingMode,
    quantity: item.quantity,
    dailyPriceDisplay: fromMinorUnits(item.dailyPriceMinor),
    weeklyPriceDisplay: fromMinorUnits(item.weeklyPriceMinor),
    monthlyPriceDisplay: fromMinorUnits(item.monthlyPriceMinor),
    customPriceDisplay: fromMinorUnits(item.customPriceMinor),
    depositDisplay: fromMinorUnits(item.depositMinor),
    discountDisplay: fromMinorUnits(item.discountMinor),
    notes: item.notes ?? "",
  }));

  return (
    <div className="flex justify-center">
      <Card className="w-full max-w-4xl">
        <CardHeader>
          <CardTitle>{t("rental.editRental")}</CardTitle>
        </CardHeader>
        <CardContent>
          <RentalWizard
            tenantId={tenantId}
            defaultCurrency={rental.currency}
            submitLabelKey="rental.save"
            initialValues={{
              customerId: rental.customerId,
              plannedStart: rental.plannedStart.slice(0, 16),
              plannedEnd: rental.plannedEnd.slice(0, 16),
              currency: rental.currency,
              discountDisplay: fromMinorUnits(rental.discountMinor),
              taxDisplay: fromMinorUnits(rental.taxMinor),
              notes: rental.notes ?? "",
              internalNotes: rental.internalNotes ?? "",
            }}
            initialItems={initialItems}
            onSubmit={handleSubmit}
            isPending={updateRental.isPending}
            errorMessage={
              updateRental.isError ? apiErrorMessage(updateRental.error, t("common.error")) : null
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
