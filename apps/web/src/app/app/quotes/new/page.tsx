"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@rentos/ui";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";

import { QuoteWizard } from "../../../../components/quotes/quote-wizard";
import { useCurrentTenantId } from "../../../../hooks/use-current-tenant";
import { useCurrentTenantRole } from "../../../../hooks/use-current-tenant-role";
import { useCreateQuote, type QuoteInput } from "../../../../hooks/use-quotes";
import { apiErrorMessage } from "../../../../lib/api-error-i18n";

export default function NewQuotePage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [tenantId] = useCurrentTenantId();
  const { data: tenantRole } = useCurrentTenantRole();
  const createQuote = useCreateQuote(tenantId);

  async function handleSubmit(input: QuoteInput): Promise<void> {
    const created = await createQuote.mutateAsync(input);
    router.push(`/app/quotes/${created.id}`);
  }

  return (
    <div className="flex justify-center">
      <Card className="w-full max-w-4xl">
        <CardHeader>
          <CardTitle>{t("quote.newQuote")}</CardTitle>
        </CardHeader>
        <CardContent>
          <QuoteWizard
            tenantId={tenantId}
            defaultCurrency={tenantRole?.tenant.defaultCurrency}
            onSubmit={handleSubmit}
            isPending={createQuote.isPending}
            errorMessage={
              createQuote.isError ? apiErrorMessage(createQuote.error, t("common.error")) : null
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
