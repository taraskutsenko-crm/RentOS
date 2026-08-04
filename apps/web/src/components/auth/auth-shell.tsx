"use client";

import type { ReactNode } from "react";

import { cn } from "@rentos/ui";

/**
 * Shared two-region layout for every real account-entry screen (staff
 * login/register/select-tenant, customer-portal login/invite-activation)
 * — see docs/UI_REDESIGN_PLAN.md Chapter 2, design decision 1. Replaces
 * five independently-duplicated `<main className="flex min-h-screen
 * items-center justify-center p-8">` blocks with one component.
 *
 * The brand panel is never decorative filler (BRAND_GUIDELINES.md "no
 * giant empty panel with no purpose") — it establishes brand/trust at a
 * glance via the wordmark + one calm supporting line, nothing else. Below
 * `lg` it collapses to a compact top strip rather than disappearing, so
 * brand presence survives on mobile without stealing form space.
 */
export function AuthShell({
  children,
  tone = "primary",
  tagline,
}: {
  children: ReactNode;
  /** `primary` for the staff stack, `sidebar` for the warmer customer-portal tone. */
  tone?: "primary" | "sidebar";
  tagline?: string;
}) {
  return (
    <div className="bg-background flex min-h-screen flex-col lg:flex-row">
      <div
        className={cn(
          "flex shrink-0 flex-col justify-center gap-2 px-6 py-8 lg:w-[38%] lg:px-16 lg:py-16",
          tone === "primary"
            ? "bg-primary text-primary-foreground"
            : "bg-sidebar text-sidebar-foreground border-border border-b lg:border-r lg:border-b-0",
        )}
      >
        <span className="text-xl font-semibold tracking-tight lg:text-2xl">Havelio</span>
        {tagline && (
          <p
            className={cn(
              "hidden max-w-sm text-sm lg:block",
              tone === "primary" ? "text-primary-foreground/80" : "text-muted-foreground",
            )}
          >
            {tagline}
          </p>
        )}
      </div>
      <div className="flex flex-1 items-center justify-center px-6 py-10 lg:px-16">{children}</div>
    </div>
  );
}
