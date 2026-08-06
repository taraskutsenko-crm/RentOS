"use client";

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@rentos/ui";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useTranslation } from "react-i18next";

import { useCurrentTenantRole } from "../../hooks/use-current-tenant-role";
import { roleHasPermission } from "../../lib/permissions";
import { QUICK_ACTION_DEFINITIONS } from "../../lib/quick-actions";

/**
 * A single header control for the most common "create X" actions — see
 * docs/UI_REDESIGN_PLAN.md Chapter 1. `open`/`onOpenChange` are optional
 * so the `N` keyboard shortcut (Chapter 5) can open this from
 * `AppLayout` without this component needing to know about shortcuts
 * itself — omit both for the default uncontrolled behavior.
 */
export function QuickCreate({
  open,
  onOpenChange,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const { data: tenantRole } = useCurrentTenantRole();

  const items = QUICK_ACTION_DEFINITIONS.filter(
    (item) => item.permission === null || roleHasPermission(tenantRole?.role, item.permission),
  );
  if (items.length === 0) return null;

  return (
    // Spread conditionally, not `open={open}` directly — `open`/`onOpenChange`
    // are `boolean | undefined` here (optional props), but Radix's own
    // `DropdownMenuProps` declares them without `| undefined`, which
    // `exactOptionalPropertyTypes` rejects unless the key is omitted
    // entirely rather than present-with-value-undefined.
    <DropdownMenu
      {...(open !== undefined ? { open } : {})}
      {...(onOpenChange !== undefined ? { onOpenChange } : {})}
    >
      <DropdownMenuTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <Plus className="size-4" aria-hidden="true" />
          <span className="hidden sm:inline">{t("app.shell.create")}</span>
          <kbd className="border-primary-foreground/30 text-primary-foreground/80 hidden rounded border px-1 py-0.5 text-[10px] sm:inline-block">
            N
          </kbd>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <DropdownMenuItem key={item.id} asChild>
              <Link href={item.href}>
                <Icon className="size-4" aria-hidden="true" />
                {t(item.labelKey)}
              </Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
