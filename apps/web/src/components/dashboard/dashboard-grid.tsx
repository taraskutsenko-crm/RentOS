import type { ReactNode } from "react";

import { cn } from "@rentos/ui";

/** Responsive stat-card grid — the same breakpoints the portal dashboard already validated. */
export function DashboardGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5", className)}>
      {children}
    </div>
  );
}
