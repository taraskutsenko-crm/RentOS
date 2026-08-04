"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@rentos/ui";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";

import { usePortalActivateInvitation } from "../../hooks/use-portal-auth";
import { apiErrorMessage } from "../../lib/api-error-i18n";
import {
  portalActivateInvitationSchema,
  type PortalActivateInvitationFormValues,
} from "../../lib/validation";
import { AuthAlert } from "../auth/auth-alert";
import { PasswordField } from "../auth/auth-field";
import { AuthSuccessState } from "../auth/auth-success";

const REDIRECT_DELAY_MS = 1200;

export function PortalActivateForm({ token }: { token: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const activateMutation = usePortalActivateInvitation();
  const [tenantName, setTenantName] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PortalActivateInvitationFormValues>({
    resolver: zodResolver(portalActivateInvitationSchema),
  });

  // A brief, real confirmation before redirecting — not an instant jump —
  // per UX_PRINCIPLES.md rule 20; still resolves to the same destination
  // this flow always used, and respects prefers-reduced-motion since it's
  // a plain timed state change, not an animation.
  useEffect(() => {
    if (!tenantName) return undefined;
    const id = window.setTimeout(() => router.push("/portal/dashboard"), REDIRECT_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [tenantName, router]);

  async function onSubmit(values: PortalActivateInvitationFormValues): Promise<void> {
    try {
      const result = await activateMutation.mutateAsync({ token, password: values.password });
      setTenantName(result.tenant.name);
    } catch {
      // Surfaced below via activateMutation.error.
    }
  }

  if (tenantName) {
    return (
      <AuthSuccessState
        title={t("portal.auth.activate.successTitle", { company: tenantName })}
        description={t("portal.auth.activate.successDescription")}
      />
    );
  }

  const pending = isSubmitting || activateMutation.isPending;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      {activateMutation.isError && (
        <AuthAlert>
          {apiErrorMessage(activateMutation.error, t("portal.auth.errors.invalidToken"))}
        </AuthAlert>
      )}

      <PasswordField
        id="password"
        label={t("portal.auth.activate.password")}
        autoComplete="new-password"
        error={errors.password && t(errors.password.message ?? "")}
        showLabel={t("common.showPassword")}
        hideLabel={t("common.hidePassword")}
        {...register("password")}
      />

      <Button type="submit" disabled={pending}>
        {pending ? t("portal.auth.activate.submitting") : t("portal.auth.activate.submit")}
      </Button>
    </form>
  );
}
