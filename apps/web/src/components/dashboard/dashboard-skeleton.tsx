import { Skeleton } from "@rentos/ui";

/**
 * One configurable skeleton, reused by `DashboardMetric` (a number-width
 * block) and `RecentActivity` (N placeholder rows) — see
 * docs/UI_REDESIGN_PLAN.md Chapter 4, design decision 6.
 */
export function DashboardSkeleton({
  variant = "rows",
  rows = 3,
}: {
  variant?: "metric" | "rows";
  rows?: number;
}) {
  if (variant === "metric") {
    return <Skeleton className="h-8 w-16" />;
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex items-center justify-between gap-4">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-5 w-20" />
        </div>
      ))}
    </div>
  );
}
