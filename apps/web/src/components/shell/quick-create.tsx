"use client";

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@rentos/ui";
import { CalendarRange, FileText, Package, Plus, Users } from "lucide-react";
import Link from "next/link";
import { useTranslation } from "react-i18next";

import { useCurrentTenantRole } from "../../hooks/use-current-tenant-role";
import { roleHasPermission } from "../../lib/permissions";

const QUICK_CREATE_ITEMS = [
  {
    id: "customer",
    href: "/app/customers/new",
    labelKey: "customer.newCustomer",
    icon: Users,
    permission: null,
  },
  {
    id: "asset",
    href: "/app/assets/new",
    labelKey: "asset.newAsset",
    icon: Package,
    permission: "assets.create",
  },
  {
    id: "rental",
    href: "/app/rentals/new",
    labelKey: "rental.newRental",
    icon: CalendarRange,
    permission: "rentals.create",
  },
  {
    id: "quote",
    href: "/app/quotes/new",
    labelKey: "quote.newQuote",
    icon: FileText,
    permission: "quotes.create",
  },
] as const;

/** A single header control for the most common "create X" actions — see docs/UI_REDESIGN_PLAN.md Chapter 1. */
export function QuickCreate() {
  const { t } = useTranslation();
  const { data: tenantRole } = useCurrentTenantRole();

  const items = QUICK_CREATE_ITEMS.filter(
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
