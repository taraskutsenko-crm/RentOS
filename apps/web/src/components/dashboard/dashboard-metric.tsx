import { AlertCircle } from "lucide-react";
import Link from "next/link";
import { useTranslation } from "react-i18next";

import { Card, CardContent } from "@rentos/ui";

import { DashboardSkeleton } from "./dashboard-skeleton";

/**
 * The stat-card primitive — implements docs/UI_PATTERNS.md's Statistics
 * cards spec: a genuine zero renders as "0", never blank; an error renders
 * "—" with a Danger-toned tooltip; loading shows a number-width skeleton.
 * See docs/UI_REDESIGN_PLAN.md Chapter 4, design decision 2.
 */
export function DashboardMetric({
  label,
  value,
  isLoading,
  isError,
  href,
}: {
  label: string;
  value: number;
  isLoading?: boolean;
  isError?: boolean;
  href?: string;
}) {
  const { t } = useTranslation();

  const body = (
    <CardContent className="p-4">
      {isLoading ? (
        <div role="status" aria-label={t("common.loading")}>
          <DashboardSkeleton variant="metric" />
        </div>
      ) : isError ? (
        <p
          className="text-destructive text-2xl font-semibold"
          title={t("common.error")}
          aria-label={t("common.error")}
        >
          <AlertCircle className="mr-1 inline size-5 align-text-bottom" aria-hidden="true" />—
        </p>
      ) : (
        <p className="text-2xl font-semibold">{value}</p>
      )}
      <p className="text-muted-foreground text-xs">{label}</p>
    </CardContent>
  );

  if (href && !isLoading && !isError) {
    return (
      <Link href={href} className="block">
        <Card className="hover:bg-accent/50 transition-colors">{body}</Card>
      </Link>
    );
  }

  return <Card>{body}</Card>;
}
