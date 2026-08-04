"use client";

import { useState, type ComponentPropsWithRef } from "react";
import { Eye, EyeOff } from "lucide-react";

import { Input, Label, cn } from "@rentos/ui";

interface AuthFieldProps extends Omit<ComponentPropsWithRef<typeof Input>, "id"> {
  id: string;
  label: string;
  error?: string | undefined;
}

/**
 * Label + Input + error-beneath-field, the one shape every auth form's
 * fields already followed by hand (~40 duplicated blocks across the five
 * real auth pages) — see docs/UI_REDESIGN_PLAN.md Chapter 2, decision 2.
 */
export function AuthField({ id, label, error, className, ...inputProps }: AuthFieldProps) {
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        aria-invalid={!!error}
        aria-describedby={errorId}
        className={className}
        {...inputProps}
      />
      {error && (
        <p id={errorId} className="text-destructive text-sm">
          {error}
        </p>
      )}
    </div>
  );
}

interface PasswordFieldProps extends AuthFieldProps {
  showLabel: string;
  hideLabel: string;
}

/**
 * `AuthField` plus a visibility toggle — a pure presentation addition
 * (the submitted value is unchanged either way) fixing UX_PRINCIPLES.md
 * rule 26 ("prevent a mistake before it happens"): today no password
 * field anywhere lets a user verify what they typed before submitting.
 */
export function PasswordField({
  id,
  label,
  error,
  showLabel,
  hideLabel,
  className,
  ...inputProps
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const errorId = error ? `${id}-error` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={visible ? "text" : "password"}
          aria-invalid={!!error}
          aria-describedby={errorId}
          className={cn("pr-9", className)}
          {...inputProps}
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? hideLabel : showLabel}
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 absolute inset-y-0 right-0 flex w-9 items-center justify-center rounded-r-md outline-none focus-visible:ring-[3px]"
        >
          {visible ? (
            <EyeOff className="size-4" aria-hidden="true" />
          ) : (
            <Eye className="size-4" aria-hidden="true" />
          )}
        </button>
      </div>
      {error && (
        <p id={errorId} className="text-destructive text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
