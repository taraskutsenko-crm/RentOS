"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Alert, AlertDescription, Button, Input, Label } from "@rentos/ui";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";

import { usePortalActivateInvitation } from "../../hooks/use-portal-auth";
import { apiErrorMessage } from "../../lib/api-error-i18n";
import {
  portalActivateInvitationSchema,
  type PortalActivateInvitationFormValues,
} from "../../lib/validation";

export function PortalActivateForm({ token }: { token: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const activateMutation = usePortalActivateInvitation();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PortalActivateInvitationFormValues>({
    resolver: zodResolver(portalActivateInvitationSchema),
  });

  async function onSubmit(values: PortalActivateInvitationFormValues): Promise<void> {
    try {
      await activateMutation.mutateAsync({ token, password: values.password });
      router.push("/portal/dashboard");
    } catch {
      // Surfaced below via activateMutation.error.
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      {activateMutation.isError && (
        <Alert variant="destructive">
          <AlertDescription>
            {apiErrorMessage(activateMutation.error, t("portal.auth.errors.invalidToken"))}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">{t("portal.auth.activate.password")}</Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          aria-invalid={!!errors.password}
          {...register("password")}
        />
        {errors.password && (
          <p className="text-destructive text-sm">{t(errors.password.message ?? "")}</p>
        )}
      </div>

      <Button type="submit" disabled={isSubmitting || activateMutation.isPending}>
        {activateMutation.isPending
          ? t("portal.auth.activate.submitting")
          : t("portal.auth.activate.submit")}
      </Button>
    </form>
  );
}
