"use client";

import { localeRegistry, type SupportedLanguage } from "@rentos/localization";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Select,
} from "@rentos/ui";
import { LogOut, Moon, ShieldCheck, Sun } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";

import { useLogout, useMe } from "../../hooks/use-auth";
import { useDarkMode } from "../../hooks/use-dark-mode";
import { useCurrentTenantRole } from "../../hooks/use-current-tenant-role";
import { useLanguagePreference } from "../../hooks/use-language-preference";

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
  const { t } = useTranslation();
  const router = useRouter();
  const { data } = useMe();
  const { data: tenantData } = useCurrentTenantRole();
  const logout = useLogout();
  const [isDark, setDarkMode] = useDarkMode("rentos_app_dark_mode");
  const { language, setLanguage } = useLanguagePreference();

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
        <div className="px-2 pb-1.5">
          <Select
            value={language}
            onChange={(event) => setLanguage(event.target.value as SupportedLanguage)}
            aria-label={t("app.shell.language")}
          >
            {localeRegistry.map((locale) => (
              <option key={locale.code} value={locale.code}>
                {locale.nativeName}
              </option>
            ))}
          </Select>
        </div>
        {user.isPlatformAdmin && (
          <>
            <DropdownMenuSeparator />
            {/* Havelio PLATFORM administration (Stage 17 closure pass) — visible only to a real platform admin (see PlatformAdminLayout's own independent server-enforced gate); never a tenant-scoped nav item. */}
            <DropdownMenuItem asChild>
              <Link href="/platform-admin">
                <ShieldCheck className="size-4" />
                {t("platformAdmin.title")}
              </Link>
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => void handleLogout()}>
          <LogOut className="size-4" />
          {t("nav.logout")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
