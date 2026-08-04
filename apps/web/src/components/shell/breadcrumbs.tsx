"use client";

import { cn } from "@rentos/ui";
import { ChevronRight } from "lucide-react";
import Link from "next/link";

import type { BreadcrumbItem } from "../../lib/breadcrumbs";

/**
 * Consistent, responsive breadcrumb trail — see docs/UI_PATTERNS.md's
 * (future) Breadcrumbs entry and docs/UI_REDESIGN_PLAN.md Chapter 1. On
 * narrow viewports, only the last two crumbs render (the full trail is
 * still available via the sidebar) so a long path never wraps the header
 * to a second line.
 */
export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  if (items.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex min-w-0 items-center text-sm">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          const hideOnMobile = items.length > 2 && index < items.length - 2;
          return (
            <li
              key={`${item.label}-${index}`}
              className={cn("flex min-w-0 items-center", hideOnMobile && "hidden sm:flex")}
            >
              {index > 0 && (
                <ChevronRight
                  className="text-muted-foreground mx-1 size-3.5 shrink-0"
                  aria-hidden="true"
                />
              )}
              {item.href && !isLast ? (
                <Link
                  href={item.href}
                  className="text-muted-foreground hover:text-foreground truncate"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  className={cn(
                    "truncate",
                    isLast ? "text-foreground font-medium" : "text-muted-foreground",
                  )}
                  aria-current={isLast ? "page" : undefined}
                >
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
