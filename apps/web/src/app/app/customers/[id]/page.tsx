"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@rentos/ui";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import { CustomerForm } from "../../../../components/customers/customer-form";
import { CustomerPortalPanel } from "../../../../components/customers/customer-portal-panel";
import { DashboardGrid, DashboardMetric } from "../../../../components/dashboard";
import { PageHeader } from "../../../../components/shell/page-header";
import { PinButton } from "../../../../components/shell/pin-button";
import { Timeline } from "../../../../components/timeline/timeline";
import {
  useCustomer,
  useCustomerSummary,
  useCustomerTimeline,
  useUpdateCustomer,
} from "../../../../hooks/use-customers";
import { useCurrentTenantId } from "../../../../hooks/use-current-tenant";
import { useTrackRecentItem } from "../../../../hooks/use-recent-items";
import { apiErrorKey } from "../../../../lib/api-error-i18n";
import { formatMoney } from "../../../../lib/money";
import { CUSTOMER_TIMELINE_REGISTRY } from "../../../../lib/timeline-registries";
import type { CustomerFormValues } from "../../../../lib/validation";

export default function EditCustomerPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [tenantId] = useCurrentTenantId();
  const { data: customer, isLoading } = useCustomer(tenantId, params.id);
  const { data: summary } = useCustomerSummary(tenantId, params.id);
  const { data: timeline } = useCustomerTimeline(tenantId, params.id);
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
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`${customer.firstName} ${customer.lastName}`}
        subtitle={t(`customer.status${customer.status === "ACTIVE" ? "Active" : "Inactive"}`)}
        secondaryActions={
          <PinButton
            entityType="customer"
            entityId={customer.id}
            label={`${customer.firstName} ${customer.lastName}`}
            href={`/app/customers/${customer.id}`}
          />
        }
      />

      <DashboardGrid>
        <DashboardMetric
          label={t("customer.summary.totalRentals")}
          value={summary?.totalRentals ?? 0}
          isLoading={!summary}
        />
        <DashboardMetric
          label={t("customer.summary.activeRentals")}
          value={summary?.activeRentals ?? 0}
          isLoading={!summary}
        />
        <Card>
          <CardContent className="p-4">
            {summary ? (
              <p className="text-2xl font-semibold">
                {formatMoney(summary.totalRevenueMinor, summary.currency)}
              </p>
            ) : (
              <div role="status" aria-label={t("common.loading")}>
                <div className="bg-muted h-8 w-24 animate-pulse rounded" />
              </div>
            )}
            <p className="text-muted-foreground text-xs">{t("customer.summary.totalRevenue")}</p>
          </CardContent>
        </Card>
        <DashboardMetric
          label={t("customer.summary.damageReports")}
          value={summary?.damageReportsCount ?? 0}
          isLoading={!summary}
        />
      </DashboardGrid>

      <div className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card>
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

          {tenantId && <CustomerPortalPanel tenantId={tenantId} customerId={params.id} />}
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("customer.sections.documents")}</CardTitle>
            </CardHeader>
            <CardContent>
              {customer.documents.length === 0 ? (
                <p className="text-muted-foreground text-sm">{t("customer.documentsEmpty")}</p>
              ) : (
                <ul className="flex flex-col gap-2 text-sm">
                  {customer.documents.map((document) => (
                    <li key={document.id} className="flex items-center justify-between">
                      <span>
                        {document.documentType === "CUSTOM" && document.customTypeName
                          ? document.customTypeName
                          : t(`document.types.${document.documentType}`)}
                        {document.title ? ` — ${document.title}` : ""}
                      </span>
                      <Link
                        href={`/app/documents/${document.id}`}
                        className="text-primary hover:underline"
                      >
                        {document.documentNumber}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("timeline.title")}</CardTitle>
            </CardHeader>
            <CardContent>
              <Timeline
                events={timeline}
                registry={CUSTOMER_TIMELINE_REGISTRY}
                isLoading={!timeline}
                emptyLabel={t("timeline.empty")}
                searchPlaceholder={t("timeline.searchPlaceholder")}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
