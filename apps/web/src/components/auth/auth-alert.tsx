import { AlertCircle, Info } from "lucide-react";

import { Alert, AlertDescription } from "@rentos/ui";

/**
 * The top-of-form banner every real auth form renders. `role="alert"`
 * (inherited from `Alert`) plus this being mounted only when there's
 * something to show is what gives screen readers the announcement — no
 * separate `aria-live` region is needed since the node itself appears on
 * mount. `variant="info"` (Task F1) is for a benign notice like "your
 * session expired, please sign in again" — not an error the user did
 * anything wrong to cause — never rendered in the same alarming red as a
 * real credentials failure.
 */
export function AuthAlert({
  children,
  variant = "destructive",
}: {
  children: string;
  variant?: "destructive" | "info";
}) {
  const Icon = variant === "info" ? Info : AlertCircle;
  return (
    <Alert variant={variant}>
      <Icon className="size-4" aria-hidden="true" />
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}
