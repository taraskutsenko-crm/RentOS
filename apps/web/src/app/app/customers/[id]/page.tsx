"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@rentos/ui";
import { useParams, useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";

import { CustomerForm } from "../../../../components/customers/customer-form";
import { useCustomer, useUpdateCustomer } from "../../../../hooks/use-customers";
import { useCurrentTenantId } from "../../../../hooks/use-current-tenant";
import { apiErrorKey } from "../../../../lib/api-error-i18n";
import type { CustomerFormValues } from "../../../../lib/validation";

export default function EditCustomerPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [tenantId] = useCurrentTenantId();
  const { data: customer, isLoading } = useCustomer(tenantId, params.id);
  const updateCustomer = useUpdateCustomer(tenantId);

  async function handleSubmit(values: CustomerFormValues): Promise<void> {
    await updateCustomer.mutateAsync({ id: params.id, input: values });
    router.push("/app/customers");
  }

  if (isLoading || !customer) {
    return <p className="text-muted-foreground text-sm">{t("common.loading")}</p>;
  }

  return (
    <div className="flex justify-center">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle>{t("customer.editCustomer")}</CardTitle>
        </CardHeader>
        <CardContent>
          <CustomerForm
            initialValues={{
              firstName: customer.firstName,
              lastName: customer.lastName,
              company: customer.company ?? "",
              phone: customer.phone ?? "",
              email: customer.email ?? "",
              vatNumber: customer.vatNumber ?? "",
              address: customer.address ?? "",
              notes: customer.notes ?? "",
              status: customer.status,
            }}
            onSubmit={handleSubmit}
            isPending={updateCustomer.isPending}
            errorMessage={updateCustomer.isError ? t(apiErrorKey(updateCustomer.error)) : null}
            submitLabel={t("customer.save")}
            submittingLabel={t("customer.saving")}
          />
        </CardContent>
      </Card>
    </div>
  );
}
