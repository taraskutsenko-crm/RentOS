"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@rentos/ui";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslation } from "react-i18next";

import { DocumentForm } from "../../../../components/documents/document-form";
import { useCreateDocument } from "../../../../hooks/use-documents";
import { useCurrentTenantId } from "../../../../hooks/use-current-tenant";
import { apiErrorMessage } from "../../../../lib/api-error-i18n";
import type { DocumentFormValues } from "../../../../lib/validation";
import type { DocumentType } from "../../../../types/document";

const DOCUMENT_TYPE_VALUES: DocumentType[] = [
  "QUOTE",
  "CONTRACT",
  "HANDOVER_PROTOCOL",
  "RETURN_PROTOCOL",
  "DAMAGE_REPORT",
  "CONTRACT_AMENDMENT",
  "CUSTOM",
];

function isDocumentType(value: string | null): value is DocumentType {
  return value !== null && (DOCUMENT_TYPE_VALUES as string[]).includes(value);
}

export default function NewDocumentPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tenantId] = useCurrentTenantId();
  const createDocument = useCreateDocument(tenantId);

  // "Generate Contract"/"Generate document" links from the Rental/Quote
  // Workspace (see rentals/[id]/page.tsx, quotes/[id]/page.tsx) pre-fill
  // these — the actual fix for the reported blank rental.number/total/
  // start/end bug, which was caused entirely by no UI path ever setting
  // Document.rentalId (see DECISIONS.md D-060).
  const rentalIdParam = searchParams.get("rentalId");
  const quoteIdParam = searchParams.get("quoteId");
  const documentTypeParam = searchParams.get("documentType");

  async function handleSubmit(values: DocumentFormValues): Promise<void> {
    const created = await createDocument.mutateAsync({
      documentType: values.documentType,
      customTypeName: values.customTypeName || undefined,
      title: values.title || null,
      customerId: values.customerId || undefined,
      assetId: values.assetId || undefined,
      rentalId: values.rentalId || undefined,
      quoteId: quoteIdParam ?? undefined,
      templateLanguage: values.templateLanguage || undefined,
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
            initialValues={{
              documentType: isDocumentType(documentTypeParam) ? documentTypeParam : "CONTRACT",
              rentalId: rentalIdParam ?? "",
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
