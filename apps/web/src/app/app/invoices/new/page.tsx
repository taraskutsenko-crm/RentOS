"use client";

import { Button, Card, CardContent, Label, Select } from "@rentos/ui";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { PageHeader } from "../../../../components/shell/page-header";
import { useCurrentTenantId } from "../../../../hooks/use-current-tenant";
import { useCustomers } from "../../../../hooks/use-customers";
import { useCreateInvoice } from "../../../../hooks/use-invoices";
import { apiErrorMessage } from "../../../../lib/api-error-i18n";

export default function NewInvoicePage() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tenantId] = useCurrentTenantId();
  const rentalId = searchParams.get("rentalId") ?? undefined;
  const addChargeDescription = searchParams.get("addChargeDescription");

  const createInvoice = useCreateInvoice(tenantId);
  const { data: customers } = useCustomers(tenantId, { pageSize: 100 });
  const [customerId, setCustomerId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const attemptedAutoCreate = useRef(false);

  useEffect(() => {
    if (rentalId && tenantId && !attemptedAutoCreate.current) {
      attemptedAutoCreate.current = true;
      createInvoice
        .mutateAsync({ rentalId })
        .then((invoice) => {
          const suffix = addChargeDescription
            ? `?addChargeDescription=${encodeURIComponent(addChargeDescription)}`
            : "";
          router.replace(`/app/invoices/${invoice.id}${suffix}`);
        })
        .catch((err: unknown) => {
          setError(apiErrorMessage(err, t("common.error")));
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rentalId, tenantId]);

  async function handleCreateStandalone(): Promise<void> {
    if (!customerId) return;
    setError(null);
    try {
      const invoice = await createInvoice.mutateAsync({
        customerId,
        items: [
          {
            description: t("invoice.newLineItem"),
            quantity: 1,
            unitNetPriceMinor: 0,
            taxRateBp: 0,
          },
        ],
      });
      router.replace(`/app/invoices/${invoice.id}`);
    } catch (err) {
      setError(apiErrorMessage(err, t("common.error")));
    }
  }

  if (rentalId) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={t("invoice.newInvoice")} />
        {error ? (
          <p className="text-destructive text-sm">{error}</p>
        ) : (
          <p className="text-muted-foreground text-sm">{t("invoice.creatingFromRental")}</p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("invoice.newInvoice")} subtitle={t("invoice.newInvoiceSubtitle")} />

      <Card className="max-w-md">
        <CardContent className="flex flex-col gap-4 p-6">
          {error && <p className="text-destructive text-sm">{error}</p>}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="customerId">{t("customer.title")}</Label>
            <Select
              id="customerId"
              value={customerId}
              onChange={(event) => setCustomerId(event.target.value)}
            >
              <option value="">{t("document.fields.none")}</option>
              {customers?.items.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.company || `${customer.firstName} ${customer.lastName}`}
                </option>
              ))}
            </Select>
          </div>

          <Button
            onClick={() => void handleCreateStandalone()}
            disabled={!customerId || createInvoice.isPending}
            className="w-fit"
          >
            {createInvoice.isPending ? t("common.saving") : t("invoice.create")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
