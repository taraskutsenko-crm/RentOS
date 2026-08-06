import { Boxes, CalendarRange, FileText, FolderOpen, Users, type LucideIcon } from "lucide-react";

import { apiClient } from "./api-client";
import type { Permission } from "./permissions";
import type { PaginatedAssets } from "../types/asset";
import type { PaginatedCustomers } from "../types/customer";
import type { PaginatedDocuments } from "../types/document";
import type { PaginatedQuotes } from "../types/quote";
import type { PaginatedRentals } from "../types/rental";

export interface SearchResult {
  id: string;
  label: string;
  description?: string | undefined;
  href: string;
}

/**
 * A pluggable, permission-aware search category — see
 * docs/UI_REDESIGN_PLAN.md Chapter 5, design decision 2. The Command
 * Palette iterates `SEARCH_PROVIDERS`; adding a category never means
 * editing the palette. Every provider here calls the exact same
 * `search`-accepting list endpoint its own list page already uses —
 * no new backend endpoint for this chapter (`ARCHITECTURE_LOCK.md`
 * §3).
 *
 * AI extension point (not implemented — see design decision 9): a
 * future `AiSearchProvider` implements this identical interface, so a
 * future AI agent calls `provider.search(query, tenantId)` the same
 * way the Command Palette already does — no separate AI-only search
 * path is needed.
 */
export interface SearchProvider {
  id: string;
  labelKey: string;
  icon: LucideIcon;
  /** null means every active tenant member may search this category. */
  permission: Permission | null;
  search(query: string, tenantId: string): Promise<SearchResult[]>;
}

const RESULT_LIMIT = 5;

export const SEARCH_PROVIDERS: SearchProvider[] = [
  {
    id: "customers",
    labelKey: "customer.title",
    icon: Users,
    permission: null,
    async search(query, tenantId) {
      const data = await apiClient.get<PaginatedCustomers>(`/tenants/${tenantId}/customers`, {
        search: query,
        pageSize: RESULT_LIMIT,
      });
      return data.items.map((customer) => ({
        id: `customer:${customer.id}`,
        label: `${customer.firstName} ${customer.lastName}`,
        description: customer.company ?? undefined,
        href: `/app/customers/${customer.id}`,
      }));
    },
  },
  {
    id: "assets",
    labelKey: "asset.title",
    icon: Boxes,
    permission: "assets.read",
    async search(query, tenantId) {
      const data = await apiClient.get<PaginatedAssets>(`/tenants/${tenantId}/assets`, {
        search: query,
        pageSize: RESULT_LIMIT,
      });
      return data.items.map((asset) => ({
        id: `asset:${asset.id}`,
        label: asset.name,
        description: asset.internalNumber,
        href: `/app/assets/${asset.id}`,
      }));
    },
  },
  {
    id: "rentals",
    labelKey: "rental.title",
    icon: CalendarRange,
    permission: "rentals.view",
    async search(query, tenantId) {
      const data = await apiClient.get<PaginatedRentals>(`/tenants/${tenantId}/rentals`, {
        search: query,
        pageSize: RESULT_LIMIT,
      });
      return data.items.map((rental) => ({
        id: `rental:${rental.id}`,
        label: rental.rentalNumber,
        description: `${rental.customer.firstName} ${rental.customer.lastName}`,
        href: `/app/rentals/${rental.id}`,
      }));
    },
  },
  {
    id: "quotes",
    labelKey: "quote.title",
    icon: FileText,
    permission: "quotes.view",
    async search(query, tenantId) {
      const data = await apiClient.get<PaginatedQuotes>(`/tenants/${tenantId}/quotes`, {
        search: query,
        pageSize: RESULT_LIMIT,
      });
      return data.items.map((quote) => ({
        id: `quote:${quote.id}`,
        label: quote.quoteNumber,
        description: `${quote.customer.firstName} ${quote.customer.lastName}`,
        href: `/app/quotes/${quote.id}`,
      }));
    },
  },
  {
    id: "documents",
    labelKey: "document.title",
    icon: FolderOpen,
    permission: "documents.view",
    async search(query, tenantId) {
      const data = await apiClient.get<PaginatedDocuments>(`/tenants/${tenantId}/documents`, {
        search: query,
        pageSize: RESULT_LIMIT,
      });
      return data.items.map((document) => ({
        id: `document:${document.id}`,
        label: document.documentNumber,
        description: document.title ?? undefined,
        href: `/app/documents/${document.id}`,
      }));
    },
  },
];
