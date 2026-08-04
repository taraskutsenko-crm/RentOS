"use client";

import type { ReactNode } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle, cn } from "@rentos/ui";

/** The one card shape every real auth screen renders inside `AuthShell`. */
export function AuthCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Card className={cn("shadow-3 w-full max-w-sm", className)}>
      <CardContent className="flex flex-col gap-6 p-6 sm:p-8">{children}</CardContent>
    </Card>
  );
}

export function AuthHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <CardHeader className="gap-1.5 p-0">
      <CardTitle className="text-2xl">{title}</CardTitle>
      {subtitle && <CardDescription>{subtitle}</CardDescription>}
    </CardHeader>
  );
}

/** The muted-text + link row every real auth form ends with. */
export function AuthFooter({ children }: { children: ReactNode }) {
  return <p className="text-muted-foreground text-center text-sm">{children}</p>;
}
