"use client";

import type { ReactNode } from "react";

/**
 * The one consistent page-header layout — see docs/UI_PATTERNS.md's
 * (future) PageHeader entry and docs/UI_REDESIGN_PLAN.md Chapter 1,
 * decision 7. Design note on why this doesn't duplicate the shell
 * Header's breadcrumb trail: the Header's breadcrumbs end in the
 * current page's name at breadcrumb weight (small, muted) purely for
 * *wayfinding*; this component's `title` is the one real, large H1 for
 * the page — the two never show the same text at the same visual
 * weight, so nothing is duplicated in the sense docs/UI_PATTERNS.md's
 * existing Header entry warns against.
 */
export function PageHeader({
  title,
  subtitle,
  primaryAction,
  secondaryActions,
  contextInfo,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  primaryAction?: ReactNode;
  secondaryActions?: ReactNode;
  contextInfo?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 pb-6 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="text-muted-foreground mt-1 text-sm">{subtitle}</p>}
        {contextInfo && <div className="mt-2 text-sm">{contextInfo}</div>}
      </div>
      {(primaryAction || secondaryActions) && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {secondaryActions}
          {primaryAction}
        </div>
      )}
    </div>
  );
}
