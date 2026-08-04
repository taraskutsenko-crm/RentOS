import { AlertCircle } from "lucide-react";

import { Alert, AlertDescription } from "@rentos/ui";

/**
 * The top-of-form error banner every real auth form renders. `role="alert"`
 * (inherited from `Alert`) plus this being mounted only when there's an
 * error is what gives screen readers the announcement — no separate
 * `aria-live` region is needed since the node itself appears on error.
 */
export function AuthAlert({ children }: { children: string }) {
  return (
    <Alert variant="destructive">
      <AlertCircle className="size-4" aria-hidden="true" />
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}
