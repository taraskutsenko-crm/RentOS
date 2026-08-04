import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../lib/utils";

const alertVariants = cva(
  "relative grid w-full grid-cols-[0_1fr] items-start gap-x-3 gap-y-0.5 rounded-lg border px-4 py-3 text-sm has-[>svg]:grid-cols-[auto_1fr] [&>svg]:col-start-1 [&>svg]:row-start-1 [&>svg]:mt-0.5",
  {
    variants: {
      variant: {
        default: "bg-card text-card-foreground",
        destructive: "border-destructive/50 bg-destructive/10 text-destructive",
        success: "border-success/50 bg-success-light text-success",
        warning: "border-warning/50 bg-warning-light text-warning",
        info: "border-info/50 bg-info-light text-info",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return <div role="alert" className={cn(alertVariants({ variant }), className)} {...props} />;
}

function AlertDescription({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("col-start-2 text-sm [&_p]:leading-relaxed", className)} {...props} />;
}

export { Alert, AlertDescription };
