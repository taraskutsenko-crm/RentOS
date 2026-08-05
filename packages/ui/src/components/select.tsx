import * as React from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "../lib/utils";

/**
 * A styled wrapper around the native `<select>` — every filter dropdown
 * in the app hand-copied the same Tailwind class string before this
 * component existed (see docs/UI_COMPONENT_INVENTORY.md). Native
 * `<select>` is kept deliberately (not a Radix combobox) since it's
 * already fully accessible and keyboard-operable with zero extra work,
 * and none of today's filters need custom option rendering.
 */
const Select = React.forwardRef<HTMLSelectElement, React.ComponentProps<"select">>(
  ({ className, children, ...props }, ref) => (
    <div className="relative inline-flex">
      <select
        ref={ref}
        className={cn(
          "border-input h-9 w-full appearance-none rounded-md border bg-transparent py-1 pr-8 pl-3 text-sm shadow-xs transition-[color,box-shadow] outline-none",
          "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
          "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className="text-muted-foreground pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2"
        aria-hidden="true"
      />
    </div>
  ),
);
Select.displayName = "Select";

export { Select };
