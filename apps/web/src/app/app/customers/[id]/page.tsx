"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@rentos/ui";
import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import { CustomerForm } from "../../../../components/customers/customer-form";
import { CustomerPortalPanel } from "../../../../components/customers/customer-portal-panel";
import { PinButton } from "../../../../components/shell/pin-button";
import { useCustomer, useUpdateCustomer } from "../../../../hooks/use-customers";
import { useCurrentTenantId } from "../../../../hooks/use-current-tenant";
import { useTrackRecentItem } from "../../../../hooks/use-recent-items";
import { apiErrorKey } from "../../../../lib/api-error-i18n";
import type { CustomerFormValues } from "../../../../lib/validation";

export default function EditCustomerPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [tenantId] = useCurrentTenantId();
  const { data: customer, isLoading } = useCustomer(tenantId, params.id);
  const updateCustomer = useUpdateCustomer(tenantId);
  const trackRecentItem = useTrackRecentItem();

  useEffect(() => {
    if (!customer) return;
    trackRecentItem({
      id: `customer:${customer.id}`,
      kind: "entity",
      entityType: "customer",
      label: `${customer.firstName} ${customer.lastName}`,
      href: `/app/customers/${customer.id}`,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-runs when the loaded customer changes
  }, [customer?.id]);

  async function handleSubmit(values: CustomerFormValues): Promise<void> {
    await updateCustomer.mutateAsync({ id: params.id, input: values });
    router.push("/app/customers");
  }

  if (isLoading || !customer) {
    return <p className="text-muted-foreground text-sm">{t("common.loading")}</p>;
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>{t("customer.editCustomer")}</CardTitle>
          <PinButton
            entityType="customer"
            entityId={customer.id}
            label={`${customer.firstName} ${customer.lastName}`}
            href={`/app/customers/${customer.id}`}
          />
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

      {tenantId && <CustomerPortalPanel tenantId={tenantId} customerId={params.id} />}
    </div>
  );
}
