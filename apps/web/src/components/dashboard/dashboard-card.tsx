import type { ReactNode } from "react";
import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@rentos/ui";

/**
 * A thin, titled container with an optional "View all" link — replaces the
 * portal dashboard's inline Card+CardHeader+CardTitle+link boilerplate. See
 * docs/UI_REDESIGN_PLAN.md Chapter 4, design decision 3.
 */
export function DashboardCard({
  title,
  viewAllHref,
  viewAllLabel,
  children,
}: {
  title: string;
  viewAllHref?: string;
  viewAllLabel?: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>{title}</CardTitle>
        {viewAllHref && viewAllLabel && (
          <Link
            href={viewAllHref}
            className="text-primary text-sm underline-offset-4 hover:underline"
          >
            {viewAllLabel}
          </Link>
        )}
      </CardHeader>
      <CardContent className="p-0">{children}</CardContent>
    </Card>
  );
}
