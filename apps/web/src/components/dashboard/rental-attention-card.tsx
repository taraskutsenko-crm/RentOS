import { AlertTriangle, CalendarClock, Clock3 } from "lucide-react";
import Link from "next/link";

import { Card, CardContent, cn } from "@rentos/ui";

import { DashboardSkeleton } from "./dashboard-skeleton";

export type RentalAttentionTone = "danger" | "warning" | "info";

const TONE_STYLES: Record<RentalAttentionTone, { icon: typeof AlertTriangle; className: string }> = {
  danger: { icon: AlertTriangle, className: "border-destructive/40 bg-danger-light text-destructive" },
  warning: { icon: Clock3, className: "border-warning/40 bg-warning-light text-warning" },
  info: { icon: CalendarClock, className: "border-info/40 bg-info-light text-info" },
};

/**
 * One "Rental attention" dashboard card — a genuine count PLUS a colored
 * icon/border/background, never color alone (docs/PRODUCT_BIBLE.md Rental
 * Attention System §B2/§B4: "do not rely on color alone"). Always
 * clickable through to the correspondingly-filtered Rentals list.
 */
export function RentalAttentionCard({
  label,
  count,
  tone,
  href,
  subtext,
  isLoading,
}: {
  label: string;
  count: number;
  tone: RentalAttentionTone;
  href: string;
  subtext?: string | undefined;
  isLoading?: boolean;
}) {
  const { icon: Icon, className } = TONE_STYLES[tone];

  const body = (
    <CardContent className="flex items-start gap-3 p-4">
      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-full border", className)}>
        <Icon className="size-4.5" aria-hidden="true" />
      </span>
      <div className="flex flex-col gap-0.5">
        {isLoading ? (
          <div role="status" aria-label="Loading">
            <DashboardSkeleton variant="metric" />
          </div>
        ) : (
          <>
            <p className="text-2xl leading-none font-semibold">{count}</p>
            <p className="text-muted-foreground text-sm">{label}</p>
            {subtext && <p className="text-muted-foreground mt-1 text-xs">{subtext}</p>}
          </>
        )}
      </div>
    </CardContent>
  );

  if (isLoading) {
    return <Card>{body}</Card>;
  }

  return (
    <Link href={href} className="block">
      <Card className="hover:bg-accent/50 transition-colors">{body}</Card>
    </Link>
  );
}
