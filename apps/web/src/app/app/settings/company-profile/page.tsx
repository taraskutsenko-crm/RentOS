"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  SignaturePad,
  TimezoneSelect,
  useToast,
} from "@rentos/ui";
import {
  buildTimezoneOptions,
  groupTimezoneOptionsByOffset,
  searchTimezoneOptions,
} from "@rentos/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";

import {
  companyLogoFileUrl,
  useDeleteCompanyLogo,
  useUploadCompanyLogo,
} from "../../../../hooks/use-company-logo";
import {
  companySignatureFileUrl,
  useCompanySignature,
  useDeleteCompanySignature,
  useUploadCompanySignature,
} from "../../../../hooks/use-company-signature";
import { useCurrentTenantId } from "../../../../hooks/use-current-tenant";
import { useCurrentTenantRole, usePermission } from "../../../../hooks/use-current-tenant-role";
import { useUpdateCompanyProfile } from "../../../../hooks/use-update-company-profile";
import { apiErrorMessage } from "../../../../lib/api-error-i18n";
import type { Tenant } from "../../../../types/auth";
import { companyProfileSchema, type CompanyProfileFormValues } from "../../../../lib/validation";

export default function CompanyProfileSettingsPage() {
  const { t } = useTranslation();
  const [tenantId] = useCurrentTenantId();
  const canManage = usePermission("tenant.manage");
  const { data, isLoading } = useCurrentTenantRole();
  const updateProfile = useUpdateCompanyProfile(tenantId);
  const { toast } = useToast();

  // Computed once per page load (mirrors DatePicker's lazy "today" —
  // recomputing on every keystroke would be pointless work; the current
  // UTC offset for a zone doesn't change meaningfully within one editing
  // session). See @rentos/shared timezone-options.ts — the canonical IANA
  // id remains the only value ever stored/submitted; this is presentation
  // only (Task A1).
  const [timezoneOptions] = useState(() => buildTimezoneOptions());
  const [timezoneSearch, setTimezoneSearch] = useState("");
  const timezoneGroups = useMemo(
    () => groupTimezoneOptionsByOffset(searchTimezoneOptions(timezoneOptions, timezoneSearch)),
    [timezoneOptions, timezoneSearch],
  );

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CompanyProfileFormValues>({
    resolver: zodResolver(companyProfileSchema),
    defaultValues: {
      name: "",
      timezone: "",
      registrationNumber: "",
      taxNumber: "",
      address: "",
      phone: "",
      email: "",
    },
  });

  useEffect(() => {
    if (data?.tenant) {
      reset({
        name: data.tenant.name,
        timezone: data.tenant.timezone,
        registrationNumber: data.tenant.registrationNumber ?? "",
        taxNumber: data.tenant.taxNumber ?? "",
        address: data.tenant.address ?? "",
        phone: data.tenant.phone ?? "",
        email: data.tenant.email ?? "",
      });
    }
  }, [data, reset]);

  async function onSubmit(values: CompanyProfileFormValues): Promise<void> {
    // Defensive double-submit guard on top of the disabled Save button below
    // — a disabled button already stops a second click/Enter from firing
    // this handler again, but this is a cheap extra line of defense against
    // any race between the click and React committing that disabled state.
    if (updateProfile.isPending) return;

    try {
      // Keep the just-saved values in the form (no reset()) — the user
      // should see exactly what they saved, not a reverted/blank form.
      await updateProfile.mutateAsync(values);
      toast({ variant: "success", description: t("tenant.companyProfile.saved") });
    } catch (error) {
      // apiErrorMessage() already extracts a safe, user-readable backend
      // validation message when the API provides one, falling back to a
      // generic message otherwise — never the raw error/stack trace.
      toast({
        variant: "destructive",
        description: apiErrorMessage(error, t("tenant.companyProfile.saveFailed")),
      });
    }
  }

  if (isLoading) {
    return <p className="text-muted-foreground text-sm">{t("common.loading")}</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("tenant.companyProfile.title")}</h1>
        <p className="text-muted-foreground text-sm">{t("tenant.companyProfile.subtitle")}</p>
      </div>

      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle>{t("tenant.companyProfile.cardTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(event) => void handleSubmit(onSubmit)(event)}
            className="flex flex-col gap-4"
            noValidate
          >
            <fieldset className="flex flex-col gap-4" disabled={!canManage}>
              <legend className="sr-only">{t("tenant.companyProfile.cardTitle")}</legend>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="name">{t("tenant.companyProfile.fields.name")}</Label>
                <Input id="name" aria-invalid={!!errors.name} {...register("name")} />
                {errors.name && (
                  <p className="text-destructive text-sm">{t(errors.name.message ?? "")}</p>
                )}
              </div>

              <div className="flex flex-col gap-1.5 sm:max-w-xs">
                <Label htmlFor="timezone">{t("tenant.companyProfile.fields.timezone")}</Label>
                <TimezoneSelect
                  id="timezone"
                  value={watch("timezone")}
                  onChange={(value) =>
                    setValue("timezone", value, { shouldValidate: true, shouldDirty: true })
                  }
                  groups={timezoneGroups}
                  search={timezoneSearch}
                  onSearchChange={setTimezoneSearch}
                  selectedOption={timezoneOptions.find((option) => option.value === watch("timezone"))}
                  disabled={!canManage}
                  aria-invalid={!!errors.timezone}
                  labels={{
                    placeholder: t("tenant.companyProfile.timezoneSelector.placeholder"),
                    searchPlaceholder: t("tenant.companyProfile.timezoneSelector.searchPlaceholder"),
                    noResults: t("tenant.companyProfile.timezoneSelector.noResults"),
                  }}
                />
                {errors.timezone && (
                  <p className="text-destructive text-sm">{t(errors.timezone.message ?? "")}</p>
                )}
                <p className="text-muted-foreground text-xs">
                  {t("tenant.companyProfile.fields.timezoneHelp")}
                </p>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="registrationNumber">
                  {t("tenant.companyProfile.fields.registrationNumber")}
                </Label>
                <Input id="registrationNumber" {...register("registrationNumber")} />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="taxNumber">{t("tenant.companyProfile.fields.taxNumber")}</Label>
                <Input id="taxNumber" {...register("taxNumber")} />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="address">{t("tenant.companyProfile.fields.address")}</Label>
                <Input id="address" {...register("address")} />
              </div>

              <div className="flex flex-col gap-1.5 sm:max-w-xs">
                <Label htmlFor="phone">{t("tenant.companyProfile.fields.phone")}</Label>
                <Input id="phone" type="tel" {...register("phone")} />
              </div>

              <div className="flex flex-col gap-1.5 sm:max-w-xs">
                <Label htmlFor="email">{t("tenant.companyProfile.fields.email")}</Label>
                <Input
                  id="email"
                  type="email"
                  aria-invalid={!!errors.email}
                  {...register("email")}
                />
                {errors.email && (
                  <p className="text-destructive text-sm">{t(errors.email.message ?? "")}</p>
                )}
                <p className="text-muted-foreground text-xs">
                  {t("tenant.companyProfile.fields.emailHelp")}
                </p>
              </div>
            </fieldset>

            {canManage && (
              <Button
                type="submit"
                disabled={isSubmitting || updateProfile.isPending}
                className="w-fit"
              >
                {updateProfile.isPending
                  ? t("tenant.companyProfile.saving")
                  : t("tenant.companyProfile.save")}
              </Button>
            )}
          </form>
        </CardContent>
      </Card>

      <CompanySignatureCard tenantId={tenantId} canManage={canManage} />

      <CompanyLogoCard tenantId={tenantId} canManage={canManage} tenant={data?.tenant ?? null} />
    </div>
  );
}

/**
 * Havelio Company Branding (docs/PRODUCT_BIBLE.md) — the tenant's own logo,
 * shown on its generated customer-facing documents instead of a generic
 * Havelio placeholder. Simpler than CompanySignatureCard: the logo's
 * metadata already lives right on the Tenant object the parent page already
 * fetched (see useCurrentTenantRole) — no dedicated loading state or
 * separate query needed here.
 */
function CompanyLogoCard({
  tenantId,
  canManage,
  tenant,
}: {
  tenantId: string | null;
  canManage: boolean;
  tenant: Tenant | null;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const upload = useUploadCompanyLogo(tenantId);
  const remove = useDeleteCompanyLogo(tenantId);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasLogo = !!tenant?.logoMimeType;
  const busy = upload.isPending || remove.isPending;

  async function handleUpload(file: File): Promise<void> {
    try {
      await upload.mutateAsync(file);
      toast({ variant: "success", description: t("tenant.companyProfile.logo.saved") });
    } catch (error) {
      toast({
        variant: "destructive",
        description: apiErrorMessage(error, t("tenant.companyProfile.logo.saveFailed")),
      });
    }
  }

  async function handleDelete(): Promise<void> {
    if (!window.confirm(t("tenant.companyProfile.logo.removeConfirm"))) return;
    try {
      await remove.mutateAsync();
      toast({ variant: "success", description: t("tenant.companyProfile.logo.removed") });
    } catch (error) {
      toast({
        variant: "destructive",
        description: apiErrorMessage(error, t("tenant.companyProfile.logo.saveFailed")),
      });
    }
  }

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle>{t("tenant.companyProfile.logo.title")}</CardTitle>
        <p className="text-muted-foreground text-sm">{t("tenant.companyProfile.logo.subtitle")}</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <fieldset className="flex flex-col gap-4" disabled={!canManage}>
          <legend className="sr-only">{t("tenant.companyProfile.logo.title")}</legend>

          <div className="flex flex-col gap-1.5">
            <span className="text-muted-foreground text-xs">
              {hasLogo ? t("tenant.companyProfile.logo.preview") : null}
            </span>
            {hasLogo && tenantId ? (
              // eslint-disable-next-line @next/next/no-img-element -- authenticated API-served image, not a static asset next/image can optimize
              <img
                src={`${companyLogoFileUrl(tenantId)}?v=${encodeURIComponent(tenant?.updatedAt ?? "")}`}
                alt=""
                className="border-input bg-muted/30 h-24 w-fit max-w-full rounded-md border object-contain p-2"
              />
            ) : (
              // Clean neutral placeholder — never a broken image icon.
              <div className="border-input bg-muted/30 text-muted-foreground flex h-24 w-48 items-center justify-center rounded-md border text-xs">
                {t("tenant.companyProfile.logo.noLogo")}
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void handleUpload(file);
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => fileInputRef.current?.click()}
            >
              {hasLogo
                ? t("tenant.companyProfile.logo.replace")
                : t("tenant.companyProfile.logo.upload")}
            </Button>
            {hasLogo && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => void handleDelete()}
              >
                {t("tenant.companyProfile.logo.remove")}
              </Button>
            )}
          </div>
        </fieldset>
      </CardContent>
    </Card>
  );
}

/**
 * Havelio Signature System (docs/PRODUCT_BIBLE.md) — the tenant's single
 * reusable, company-level handwritten signature (NOT a qualified
 * electronic signature). Split out as its own Card rather than folded
 * into the flat field list above: it has its own preview/replace/delete
 * lifecycle and its own two-input identity (signer name + position)
 * distinct from the rest of Company Profile's singleton fields. Loading
 * state lives here; the actual form is keyed by the loaded signature's id
 * (see CompanySignatureForm below) so its local input state is always
 * freshly initialized from real data — no effect syncing query data into
 * local state (see react-hooks/set-state-in-effect, and the identical
 * convention already used by InvoiceEditor).
 */
function CompanySignatureCard({
  tenantId,
  canManage,
}: {
  tenantId: string | null;
  canManage: boolean;
}) {
  const { t } = useTranslation();
  const { data, isLoading } = useCompanySignature(tenantId);

  if (isLoading) {
    return (
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle>{t("tenant.companyProfile.signature.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">{t("common.loading")}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <CompanySignatureForm
      key={data?.signature?.id ?? "empty"}
      tenantId={tenantId}
      canManage={canManage}
      signature={data?.signature ?? null}
    />
  );
}

function CompanySignatureForm({
  tenantId,
  canManage,
  signature,
}: {
  tenantId: string | null;
  canManage: boolean;
  signature: { id: string; representativeName: string; representativeTitle: string | null } | null;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const upload = useUploadCompanySignature(tenantId);
  const remove = useDeleteCompanySignature(tenantId);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [drawOpen, setDrawOpen] = useState(false);
  const [representativeName, setRepresentativeName] = useState(signature?.representativeName ?? "");
  const [representativeTitle, setRepresentativeTitle] = useState(
    signature?.representativeTitle ?? "",
  );

  const nameMissing = representativeName.trim().length === 0;

  async function handleUpload(file: File, method: "DRAWN" | "UPLOADED"): Promise<void> {
    if (nameMissing) {
      toast({
        variant: "destructive",
        description: t("tenant.companyProfile.signature.nameRequired"),
      });
      return;
    }
    try {
      await upload.mutateAsync({
        file,
        representativeName: representativeName.trim(),
        ...(representativeTitle.trim() ? { representativeTitle: representativeTitle.trim() } : {}),
        method,
      });
      setDrawOpen(false);
      toast({ variant: "success", description: t("tenant.companyProfile.signature.saved") });
    } catch (error) {
      toast({
        variant: "destructive",
        description: apiErrorMessage(error, t("tenant.companyProfile.signature.saveFailed")),
      });
    }
  }

  async function handleDelete(): Promise<void> {
    if (!window.confirm(t("tenant.companyProfile.signature.deleteConfirm"))) return;
    try {
      await remove.mutateAsync();
      toast({ variant: "success", description: t("tenant.companyProfile.signature.deleted") });
    } catch (error) {
      toast({
        variant: "destructive",
        description: apiErrorMessage(error, t("tenant.companyProfile.signature.saveFailed")),
      });
    }
  }

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle>{t("tenant.companyProfile.signature.title")}</CardTitle>
        <p className="text-muted-foreground text-sm">
          {t("tenant.companyProfile.signature.subtitle")}
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <fieldset className="flex flex-col gap-4" disabled={!canManage}>
          <legend className="sr-only">{t("tenant.companyProfile.signature.title")}</legend>

          <div className="flex flex-col gap-1.5 sm:max-w-xs">
            <Label htmlFor="signerName">
              {t("tenant.companyProfile.signature.fields.signerName")}
            </Label>
            <Input
              id="signerName"
              value={representativeName}
              onChange={(event) => setRepresentativeName(event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5 sm:max-w-xs">
            <Label htmlFor="signerTitle">
              {t("tenant.companyProfile.signature.fields.signerTitle")}
            </Label>
            <Input
              id="signerTitle"
              value={representativeTitle}
              onChange={(event) => setRepresentativeTitle(event.target.value)}
            />
          </div>

          {signature && (
            <div className="flex flex-col gap-1.5">
              <span className="text-muted-foreground text-xs">
                {t("tenant.companyProfile.signature.preview")}
              </span>
              {/* eslint-disable-next-line @next/next/no-img-element -- authenticated API-served image, not a static asset next/image can optimize */}
              <img
                src={companySignatureFileUrl(tenantId ?? "")}
                alt=""
                className="border-input bg-muted/30 h-24 w-fit max-w-full rounded-md border object-contain p-2"
              />
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void handleUpload(file, "UPLOADED");
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={upload.isPending}
              onClick={() => fileInputRef.current?.click()}
            >
              {t("tenant.companyProfile.signature.upload")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={upload.isPending}
              onClick={() => setDrawOpen(true)}
            >
              {t("tenant.companyProfile.signature.draw")}
            </Button>
            {signature && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={remove.isPending}
                onClick={() => void handleDelete()}
              >
                {t("tenant.companyProfile.signature.delete")}
              </Button>
            )}
          </div>
        </fieldset>
      </CardContent>

      <Dialog open={drawOpen} onOpenChange={setDrawOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("tenant.companyProfile.signature.drawTitle")}</DialogTitle>
          </DialogHeader>
          <SignaturePad
            isSaving={upload.isPending}
            labels={{
              clear: t("signaturePad.clear"),
              undo: t("signaturePad.undo"),
              save: t("signaturePad.save"),
              cancel: t("signaturePad.cancel"),
              emptyHint: t("signaturePad.emptyHint"),
            }}
            onCancel={() => setDrawOpen(false)}
            onSave={(file) => void handleUpload(file, "DRAWN")}
          />
        </DialogContent>
      </Dialog>
    </Card>
  );
}
