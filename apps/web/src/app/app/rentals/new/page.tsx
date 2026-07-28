"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@rentos/ui";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";

import { RentalWizard } from "../../../../components/rentals/rental-wizard";
import { useCreateRental, type RentalInput } from "../../../../hooks/use-rentals";
import { useCurrentTenantId } from "../../../../hooks/use-current-tenant";
import { useCurrentTenantRole } from "../../../../hooks/use-current-tenant-role";
import { apiErrorMessage } from "../../../../lib/api-error-i18n";

export default function NewRentalPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [tenantId] = useCurrentTenantId();
  const { data: tenantRole } = useCurrentTenantRole();
  const createRental = useCreateRental(tenantId);

  async function handleSubmit(input: RentalInput): Promise<void> {
    const created = await createRental.mutateAsync(input);
    router.push(`/app/rentals/${created.id}`);
  }

  return (
    <div className="flex justify-center">
      <Card className="w-full max-w-4xl">
        <CardHeader>
          <CardTitle>{t("rental.newRental")}</CardTitle>
        </CardHeader>
        <CardContent>
          <RentalWizard
            tenantId={tenantId}
            defaultCurrency={tenantRole?.tenant.defaultCurrency}
            onSubmit={handleSubmit}
            isPending={createRental.isPending}
            errorMessage={
              createRental.isError ? apiErrorMessage(createRental.error, t("common.error")) : null
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
