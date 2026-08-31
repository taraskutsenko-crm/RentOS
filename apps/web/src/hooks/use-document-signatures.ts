"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "../lib/api-client";
import type {
  DocumentSignatureEvidence,
  RentOSDocument,
  SignatureSignerType,
} from "../types/document";

const BASE_KEY = "document-signatures";
/** Mirrors the private BASE_KEY constant in use-documents.ts — kept as a literal here since that module doesn't export it. */
const DOCUMENTS_BASE_KEY = "documents";

export function documentSignatureFileUrl(
  tenantId: string,
  documentId: string,
  evidenceId: string,
): string {
  return `${process.env.NEXT_PUBLIC_API_URL}/tenants/${tenantId}/documents/${documentId}/signatures/${evidenceId}/file`;
}

export function useDocumentSignatures(tenantId: string | null, documentId: string | null) {
  return useQuery({
    queryKey: [BASE_KEY, tenantId, documentId],
    queryFn: () =>
      apiClient.get<DocumentSignatureEvidence[]>(
        `/tenants/${tenantId}/documents/${documentId}/signatures`,
      ),
    enabled: !!tenantId && !!documentId,
  });
}

export interface CaptureDocumentSignatureInput {
  signerType: SignatureSignerType;
  method: "STORED_SIGNATURE" | "DRAWN" | "UPLOADED";
  signerName: string;
  signerTitle?: string;
  signerEmail?: string;
  /** Omitted only when method is STORED_SIGNATURE. */
  file?: File;
}

export function useCaptureDocumentSignature(tenantId: string | null, documentId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CaptureDocumentSignatureInput) => {
      const formData = new FormData();
      formData.append("signerType", input.signerType);
      formData.append("method", input.method);
      formData.append("signerName", input.signerName);
      if (input.signerTitle) formData.append("signerTitle", input.signerTitle);
      if (input.signerEmail) formData.append("signerEmail", input.signerEmail);
      if (input.file) formData.append("file", input.file);
      return apiClient.postForm<{ evidence: DocumentSignatureEvidence; document: RentOSDocument }>(
        `/tenants/${tenantId}/documents/${documentId}/signatures`,
        formData,
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [BASE_KEY, tenantId, documentId] });
      void queryClient.invalidateQueries({
        queryKey: [DOCUMENTS_BASE_KEY, tenantId, "detail", documentId],
      });
      void queryClient.invalidateQueries({
        queryKey: [DOCUMENTS_BASE_KEY, tenantId, "history", documentId],
      });
    },
  });
}
