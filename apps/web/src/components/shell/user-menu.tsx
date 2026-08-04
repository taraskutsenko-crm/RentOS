"use client";

import {
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@rentos/ui";
import { LogOut, Moon, Sun } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";

import { useLogout, useMe } from "../../hooks/use-auth";
import { useDarkMode } from "../../hooks/use-dark-mode";
import { useCurrentTenantRole } from "../../hooks/use-current-tenant-role";

const LANGUAGES = [
  { code: "en", label: "EN" },
  { code: "de", label: "DE" },
  { code: "es", label: "ES" },
  { code: "pl", label: "PL" },
  { code: "ru", label: "RU" },
  { code: "uk", label: "UK" },
] as const;

function initials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

/**
 * Professional profile menu — see docs/UI_REDESIGN_PLAN.md Chapter 1.
 * "Future account switch" from the task's own spec is deliberately not a
 * second control here: multi-tenant switching already exists as
 * `TenantSwitcher`, so duplicating it in this menu would violate
 * docs/UX_PRINCIPLES.md rule 30 (consistency beats a second, competing
 * surface for the same action).
 */
export function UserMenu() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { data } = useMe();
  const { data: tenantData } = useCurrentTenantRole();
  const logout = useLogout();
  const [isDark, setDarkMode] = useDarkMode("rentos_app_dark_mode");

  if (!data) return null;
  const { user } = data;

  async function handleLogout(): Promise<void> {
    await logout.mutateAsync();
    router.replace("/login");
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="focus-visible:ring-ring/50 flex size-8 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-[3px]"
        aria-label={t("app.shell.userMenu")}
      >
        <span className="bg-secondary text-secondary-foreground flex size-8 items-center justify-center rounded-full text-xs font-medium">
          {initials(user.firstName, user.lastName)}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-56">
        <DropdownMenuLabel className="flex flex-col gap-0.5 py-1.5">
          <span className="text-foreground text-sm font-medium">
            {user.firstName} {user.lastName}
          </span>
          <span className="text-muted-foreground truncate text-xs font-normal">{user.email}</span>
          {tenantData?.tenant.name && (
            <span className="text-muted-foreground truncate text-xs font-normal">
              {tenantData.tenant.name}
            </span>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => setDarkMode(!isDark)}>
          {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
          {isDark ? t("app.shell.lightMode") : t("app.shell.darkMode")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{t("app.shell.language")}</DropdownMenuLabel>
        <div className="grid grid-cols-3 gap-1 px-2 pb-1.5">
          {LANGUAGES.map((language) => (
            <button
              key={language.code}
              type="button"
              onClick={() => void i18n.changeLanguage(language.code)}
              className={cn(
                "rounded-sm border px-2 py-1 text-xs transition-colors duration-[var(--duration-fast)]",
                i18n.language === language.code
                  ? "border-primary bg-primary-light text-primary font-medium"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {language.label}
            </button>
          ))}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => void handleLogout()}>
          <LogOut className="size-4" />
          {t("nav.logout")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
