"use client";

import { useMutation } from "@tanstack/react-query";

import { ApiError, apiClient } from "../lib/api-client";
import type { PublicDocumentView } from "../types/document";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

/**
 * Both public document routes are POST, unlike Quotes' GET-based public
 * view (see PublicDocumentsController's doc comment) — a share link may be
 * password-protected, and a password has to travel in a body, never a
 * query string. That rules out plain useQuery-by-URL and a direct <a href>
 * for the PDF, so both are modeled as mutations here instead.
 */
export function useViewPublicDocument(token: string | null) {
  return useMutation({
    mutationFn: (password?: string) => {
      if (!token) throw new Error("Missing token");
      return apiClient.post<PublicDocumentView>(`/public/documents/${token}/view`, { password });
    },
  });
}

async function fetchPublicDocumentPdf(token: string, password?: string): Promise<Blob> {
  const response = await fetch(`${API_URL}/public/documents/${token}/pdf`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });

  if (!response.ok) {
    let message = "Request failed";
    try {
      const body = (await response.json()) as { message?: string | string[] };
      message = Array.isArray(body.message) ? body.message.join(", ") : (body.message ?? message);
    } catch {
      // Non-JSON error body — fall back to the generic message.
    }
    throw new ApiError(message, response.status);
  }

  return response.blob();
}

export function useDownloadPublicDocumentPdf(token: string | null) {
  return useMutation({
    mutationFn: (password?: string) => {
      if (!token) throw new Error("Missing token");
      return fetchPublicDocumentPdf(token, password);
    },
  });
}
