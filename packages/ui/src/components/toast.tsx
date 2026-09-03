"use client";

import { CircleCheck, CircleX, X } from "lucide-react";
import * as React from "react";

import { cn } from "../lib/utils";

export type ToastVariant = "default" | "success" | "destructive";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastInput {
  /** The main message — always shown. */
  description: string;
  /** Optional bold lead-in shown above `description`. */
  title?: string;
  variant?: ToastVariant;
  /** Auto-dismiss delay in ms. Set to `0` to require manual dismissal. */
  duration?: number;
  /**
   * An optional single call-to-action button (e.g. "View plans" on an
   * entitlement-denied error — see docs/DECISIONS.md "never a generic
   * 403"). Clicking it also dismisses the toast. When set, `duration`
   * should usually be `0` (require manual dismissal) so the action has
   * time to be seen/used — callers decide, this component doesn't force it.
   */
  action?: ToastAction;
}

interface ToastRecord extends ToastInput {
  id: string;
}

interface ToastContextValue {
  toast: (input: ToastInput) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

const DEFAULT_DURATION_MS = 5000;

const variantStyles: Record<ToastVariant, string> = {
  default: "border-border bg-card text-card-foreground",
  success: "border-success/50 bg-success-light text-success",
  destructive: "border-destructive/50 bg-destructive/10 text-destructive",
};

/**
 * The app's one toast/notification system — a minimal, dependency-free
 * primitive (no external toast library) so this stays a single source of
 * truth rather than a second framework layered on top of the existing
 * inline `Alert` pattern. Mount once at the app root (see
 * apps/web/src/app/layout.tsx); any client component below it calls
 * `useToast()` to show a non-blocking, auto-dismissing notification.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastRecord[]>([]);

  const dismiss = React.useCallback((id: string) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const toast = React.useCallback(
    (input: ToastInput) => {
      const id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const duration = input.duration ?? DEFAULT_DURATION_MS;
      setToasts((current) => [...current, { ...input, id }]);
      if (duration > 0) {
        setTimeout(() => dismiss(id), duration);
      }
    },
    [dismiss],
  );

  const value = React.useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="true"
        data-testid="toast-viewport"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-end gap-2 p-4 sm:inset-x-auto sm:right-0"
      >
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onDismiss }: { toast: ToastRecord; onDismiss: () => void }) {
  const variant = toast.variant ?? "default";
  const Icon = variant === "success" ? CircleCheck : variant === "destructive" ? CircleX : null;

  return (
    <div
      role="status"
      className={cn(
        "pointer-events-auto flex w-full max-w-sm items-start gap-2 rounded-lg border px-4 py-3 text-sm shadow-lg",
        variantStyles[variant],
      )}
    >
      {Icon && <Icon className="mt-0.5 size-4 shrink-0" />}
      <div className="flex-1">
        {toast.title && <p className="font-medium">{toast.title}</p>}
        <p className={cn(toast.title ? "text-muted-foreground" : undefined)}>{toast.description}</p>
        {toast.action && (
          <button
            type="button"
            onClick={() => {
              toast.action?.onClick();
              onDismiss();
            }}
            className="mt-1.5 text-sm font-medium underline underline-offset-2 hover:no-underline"
          >
            {toast.action.label}
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="shrink-0 rounded-sm opacity-70 transition-opacity hover:opacity-100"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

/** Throws outside a `ToastProvider` — a toast with nowhere to render is a bug, not a silent no-op. */
export function useToast(): ToastContextValue {
  const ctx = React.useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast() must be used within a <ToastProvider>");
  }
  return ctx;
}
