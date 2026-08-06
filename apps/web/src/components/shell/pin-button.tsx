"use client";

import { cn } from "@rentos/ui";
import { Pin } from "lucide-react";
import { useTranslation } from "react-i18next";

import { usePinnedItems } from "../../hooks/use-pinned-items";

/**
 * A pin/favorite toggle, generic over `entityType` — see
 * docs/UI_REDESIGN_PLAN.md Chapter 5, design decision 6. Any future
 * entity detail page adds one `<PinButton entityType="...">` call; no
 * new store code.
 */
export function PinButton({
  entityType,
  entityId,
  label,
  href,
}: {
  entityType: string;
  entityId: string;
  label: string;
  href: string;
}) {
  const { t } = useTranslation();
  const { isPinned, togglePinned } = usePinnedItems();
  const id = `${entityType}:${entityId}`;
  const pinned = isPinned(id);

  return (
    <button
      type="button"
      onClick={() => togglePinned({ id, entityType, entityId, label, href })}
      aria-pressed={pinned}
      aria-label={pinned ? t("app.shell.unpin") : t("app.shell.pin")}
      title={pinned ? t("app.shell.unpin") : t("app.shell.pin")}
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-md border transition-colors duration-[var(--duration-fast)]",
        pinned
          ? "border-primary bg-primary-light text-primary"
          : "border-border text-muted-foreground hover:text-foreground",
      )}
    >
      <Pin className={cn("size-4", pinned && "fill-current")} aria-hidden="true" />
    </button>
  );
}
