"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import type { BreadcrumbItem } from "../../lib/breadcrumbs";

interface BreadcrumbContextValue {
  override: BreadcrumbItem[] | null;
  setOverride: (items: BreadcrumbItem[] | null) => void;
}

const BreadcrumbContext = createContext<BreadcrumbContextValue | null>(null);

const NOOP_CONTEXT: BreadcrumbContextValue = { override: null, setOverride: () => {} };

/** Wraps the app shell so any page below it can override the Header's derived breadcrumb trail. */
export function BreadcrumbProvider({ children }: { children: ReactNode }) {
  const [override, setOverride] = useState<BreadcrumbItem[] | null>(null);
  const value = useMemo(() => ({ override, setOverride }), [override]);
  return <BreadcrumbContext.Provider value={value}>{children}</BreadcrumbContext.Provider>;
}

/**
 * Degrades gracefully outside `BreadcrumbProvider` (e.g. a page rendered
 * in isolation in a unit test) rather than throwing — the override is
 * genuinely optional progressive enhancement, not something every render
 * context is required to supply.
 */
export function useBreadcrumbContext(): BreadcrumbContextValue {
  const context = useContext(BreadcrumbContext);
  return context ?? NOOP_CONTEXT;
}

/**
 * Called by a detail page that knows its own record's human-readable
 * name (e.g. a rental number) — see docs/UI_REDESIGN_PLAN.md Chapter 1,
 * decision 7. Overrides the Header's pathname-derived trail for as long
 * as the page is mounted; clears automatically on unmount/navigation so
 * the next page's own derivation (or lack of override) takes over.
 */
export function usePageBreadcrumbs(items: BreadcrumbItem[] | null): void {
  const { setOverride } = useBreadcrumbContext();
  const key = items ? JSON.stringify(items) : null;

  useEffect(() => {
    setOverride(items);
    return () => setOverride(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-runs only when the serialized content actually changes, not on every render
  }, [key, setOverride]);
}
