"use client";

import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import * as React from "react";

import { cn } from "../lib/utils";

/**
 * One shared TooltipProvider per app root — Radix requires it once, high in
 * the tree, so every `Tooltip` below shares the same hover/focus delay
 * config instead of each instance re-declaring its own.
 */
const TooltipProvider = TooltipPrimitive.Provider;

function TooltipContent({
  className,
  sideOffset = 6,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          "bg-foreground text-background havelio-fade z-modal max-w-xs rounded-md px-3 py-1.5 text-xs shadow-md",
          className,
        )}
        {...props}
      />
    </TooltipPrimitive.Portal>
  );
}

export interface TooltipProps {
  /** The truthful, plain-language explanation shown on hover and keyboard focus. */
  content: React.ReactNode;
  /** The trigger element — must be a single focusable element (a button, link, etc.). */
  children: React.ReactElement;
  /** Delay before showing, in ms. Kept short — this is clarification, not a rare hint. */
  delayDuration?: number;
}

/**
 * Accessible tooltip: shows on mouse hover AND keyboard focus (Radix's
 * Trigger listens to both `onFocus`/`onBlur` and pointer events natively —
 * no extra wiring needed here), and is exposed to screen readers via
 * `aria-describedby` on the trigger, which Radix sets automatically. Reuse
 * this everywhere a control's purpose needs a truthful one-line explanation
 * instead of an ad-hoc native `title=""` (which is mouse-only and has no
 * consistent styling or timing).
 */
export function Tooltip({ content, children, delayDuration = 200 }: TooltipProps) {
  return (
    <TooltipProvider delayDuration={delayDuration}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipContent>{content}</TooltipContent>
      </TooltipPrimitive.Root>
    </TooltipProvider>
  );
}
