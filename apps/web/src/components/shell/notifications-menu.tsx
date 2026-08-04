"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@rentos/ui";
import { Bell } from "lucide-react";
import { useTranslation } from "react-i18next";

/**
 * Staff notification center — architecture only, honestly empty. See
 * docs/UI_AUDIT.md finding #7 and docs/UI_REDESIGN_PLAN.md Chapter 1,
 * decision 4: no staff notification backend/model exists yet (only the
 * Customer Portal has one), and building one is a business-logic change
 * out of scope for a UI shell chapter. This renders the real, fully
 * styled panel shape (bell, badge, grouped-empty-state) with an
 * unconditional empty state today, rather than fabricating fake
 * notifications or a fake unread count — the badge never renders because
 * there is no real unread count to show.
 */
export function NotificationsMenu() {
  const { t } = useTranslation();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="text-muted-foreground hover:text-foreground hover:bg-neutral-50 dark:hover:bg-neutral-800 relative flex size-8 items-center justify-center rounded-full outline-none transition-colors duration-[var(--duration-fast)] focus-visible:ring-[3px] focus-visible:ring-ring/50"
        aria-label={t("app.shell.notifications.title")}
      >
        <Bell className="size-[18px]" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-80">
        <DropdownMenuLabel>{t("app.shell.notifications.title")}</DropdownMenuLabel>
        <p className="text-muted-foreground px-2 py-6 text-center text-sm">
          {t("app.shell.notifications.empty")}
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
