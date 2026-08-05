import type { ReactNode } from "react";
import Link from "next/link";

import { Button } from "@rentos/ui";

export interface QuickAction {
  key: string;
  label: string;
  href: string;
  icon: ReactNode;
  /** Omit for actions with no permission family (e.g. Customers). */
  visible?: boolean;
}

/**
 * Links to existing, already-permission-gated create routes — invents no
 * new workflow. An action is hidden entirely (not disabled) when the
 * current user lacks its permission, matching the existing
 * "enforced by omission" nav/row-action convention. See
 * docs/UI_REDESIGN_PLAN.md Chapter 4, design decision 8.
 */
export function QuickActions({ actions }: { actions: QuickAction[] }) {
  const visibleActions = actions.filter((action) => action.visible !== false);

  if (visibleActions.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {visibleActions.map((action) => (
        <Button key={action.key} variant="outline" size="sm" asChild>
          <Link href={action.href}>
            {action.icon}
            {action.label}
          </Link>
        </Button>
      ))}
    </div>
  );
}
