"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@rentos/ui";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";

import { DocumentForm } from "../../../../components/documents/document-form";
import { useCreateDocument } from "../../../../hooks/use-documents";
import { useCurrentTenantId } from "../../../../hooks/use-current-tenant";
import { apiErrorMessage } from "../../../../lib/api-error-i18n";
import type { DocumentFormValues } from "../../../../lib/validation";

export default function NewDocumentPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [tenantId] = useCurrentTenantId();
  const createDocument = useCreateDocument(tenantId);

  async function handleSubmit(values: DocumentFormValues): Promise<void> {
    const created = await createDocument.mutateAsync({
      documentType: values.documentType,
      customTypeName: values.customTypeName || undefined,
      title: values.title || null,
      customerId: values.customerId || undefined,
      assetId: values.assetId || undefined,
    });
    router.push(`/app/documents/${created.id}`);
  }

  return (
    <div className="flex justify-center">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle>{t("document.newDocument")}</CardTitle>
        </CardHeader>
        <CardContent>
          <DocumentForm
            onSubmit={handleSubmit}
            isPending={createDocument.isPending}
            errorMessage={
              createDocument.isError
                ? apiErrorMessage(createDocument.error, t("common.error"))
                : null
            }
            submitLabel={t("document.save")}
            submittingLabel={t("document.saving")}
          />
        </CardContent>
      </Card>
    </div>
  );
}
