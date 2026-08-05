import type { ReactNode } from "react";
import { AlertCircle } from "lucide-react";

import { Alert, AlertDescription, Button } from "@rentos/ui";

import { DashboardSkeleton } from "./dashboard-skeleton";
import { EmptyDashboardState } from "./empty-dashboard-state";

/**
 * A generic "recent items" list widget — not a fabricated unified activity
 * feed (no audit-log read endpoint exists). Reused as-is for Recent Rentals
 * and Recent Documents against two real, already-existing list endpoints.
 * See docs/UI_REDESIGN_PLAN.md Chapter 4, design decision 4.
 */
export function RecentActivity<T>({
  items,
  getRowId,
  renderRow,
  isLoading,
  isError,
  emptyMessage,
  errorMessage,
  onRetry,
  retryLabel,
  loadingLabel,
}: {
  items: T[];
  getRowId: (item: T) => string;
  renderRow: (item: T) => ReactNode;
  isLoading?: boolean;
  isError?: boolean;
  emptyMessage: string;
  errorMessage: string;
  onRetry?: () => void;
  retryLabel?: string;
  loadingLabel: string;
}) {
  if (isError) {
    return (
      <div className="p-4">
        <Alert variant="destructive">
          <AlertCircle className="size-4" aria-hidden="true" />
          <AlertDescription className="flex items-center justify-between gap-4">
            <span>{errorMessage}</span>
            {onRetry && retryLabel && (
              <Button variant="outline" size="sm" onClick={onRetry}>
                {retryLabel}
              </Button>
            )}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div role="status" aria-live="polite" aria-label={loadingLabel}>
        <DashboardSkeleton variant="rows" rows={3} />
      </div>
    );
  }

  if (items.length === 0) {
    return <EmptyDashboardState message={emptyMessage} />;
  }

  return (
    <ul>
      {items.map((item) => (
        <li key={getRowId(item)} className="border-b p-4 last:border-0">
          {renderRow(item)}
        </li>
      ))}
    </ul>
  );
}
