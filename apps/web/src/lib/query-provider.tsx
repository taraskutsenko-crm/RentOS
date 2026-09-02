"use client";

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

import { buildSessionExpiredLoginUrl, isSessionExpiredError } from "./session-expiry";

/**
 * Task F1/F2 — a real session expiry (401 from an already-authenticated
 * request, see session-expiry.ts) is handled exactly once, globally, for
 * every query and mutation in the app: redirect to the right login screen
 * with the current location preserved as `returnTo`, rather than each of
 * the ~30 call sites that show `apiErrorMessage(error, fallback)` needing
 * to special-case it individually (which is how "Authentication required"
 * leaked into a feature panel verbatim — see DECISIONS.md). A full
 * navigation (`window.location.href`, not the Next router) is deliberate:
 * it also discards every in-memory query/mutation cache entry, so no
 * stale "still signed in" UI can flash after the redirect.
 */
export function handleGlobalQueryError(error: unknown): void {
  if (typeof window === "undefined" || !isSessionExpiredError(error)) return;
  const currentLocation = `${window.location.pathname}${window.location.search}`;
  window.location.href = buildSessionExpiredLoginUrl(error.path, currentLocation);
}

export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1, refetchOnWindowFocus: false },
        },
        queryCache: new QueryCache({ onError: handleGlobalQueryError }),
        mutationCache: new MutationCache({ onError: handleGlobalQueryError }),
      }),
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
