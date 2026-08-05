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

/** A single header control for the most common "create X" actions — see docs/UI_REDESIGN_PLAN.md Chapter 1. */
export function QuickCreate() {
  const { t } = useTranslation();
  const { data: tenantRole } = useCurrentTenantRole();

  const items = QUICK_ACTION_DEFINITIONS.filter(
    (item) => item.permission === null || roleHasPermission(tenantRole?.role, item.permission),
  );
  if (items.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <Plus className="size-4" aria-hidden="true" />
          <span className="hidden sm:inline">{t("app.shell.create")}</span>
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
