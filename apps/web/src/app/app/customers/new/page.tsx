"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@rentos/ui";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";

import { CustomerForm } from "../../../../components/customers/customer-form";
import { useCreateCustomer } from "../../../../hooks/use-customers";
import { useCurrentTenantId } from "../../../../hooks/use-current-tenant";
import { apiErrorKey } from "../../../../lib/api-error-i18n";
import type { CustomerFormValues } from "../../../../lib/validation";

export default function NewCustomerPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [tenantId] = useCurrentTenantId();
  const createCustomer = useCreateCustomer(tenantId);

  async function handleSubmit(values: CustomerFormValues): Promise<void> {
    await createCustomer.mutateAsync(values);
    router.push("/app/customers");
  }

  return (
    <div className="flex justify-center">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle>{t("customer.newCustomer")}</CardTitle>
        </CardHeader>
        <CardContent>
          <CustomerForm
            onSubmit={handleSubmit}
            isPending={createCustomer.isPending}
            errorMessage={createCustomer.isError ? t(apiErrorKey(createCustomer.error)) : null}
            submitLabel={t("customer.save")}
            submittingLabel={t("customer.saving")}
          />
        </CardContent>
      </Card>
    </div>
  );
}
