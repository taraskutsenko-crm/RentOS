"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Alert, AlertDescription, Button, Input, Label } from "@rentos/ui";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";

import { customerSchema, type CustomerFormValues } from "../../lib/validation";

export interface CustomerFormProps {
  initialValues?: Partial<CustomerFormValues>;
  onSubmit: (values: CustomerFormValues) => Promise<void>;
  isPending: boolean;
  errorMessage?: string | null;
  submitLabel: string;
  submittingLabel: string;
}

export function CustomerForm({
  initialValues,
  onSubmit,
  isPending,
  errorMessage,
  submitLabel,
  submittingLabel,
}: CustomerFormProps) {
  const { t } = useTranslation();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CustomerFormValues>({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      company: "",
      phone: "",
      email: "",
      vatNumber: "",
      address: "",
      notes: "",
      status: "ACTIVE",
      ...initialValues,
    },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      {errorMessage && (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="firstName">{t("customer.firstName")}</Label>
          <Input id="firstName" aria-invalid={!!errors.firstName} {...register("firstName")} />
          {errors.firstName && (
            <p className="text-destructive text-sm">{t(errors.firstName.message ?? "")}</p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="lastName">{t("customer.lastName")}</Label>
          <Input id="lastName" aria-invalid={!!errors.lastName} {...register("lastName")} />
          {errors.lastName && (
            <p className="text-destructive text-sm">{t(errors.lastName.message ?? "")}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="company">{t("customer.company")}</Label>
          <Input id="company" {...register("company")} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="phone">{t("customer.phone")}</Label>
          <Input id="phone" {...register("phone")} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">{t("customer.email")}</Label>
          <Input id="email" type="email" aria-invalid={!!errors.email} {...register("email")} />
          {errors.email && (
            <p className="text-destructive text-sm">{t(errors.email.message ?? "")}</p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="vatNumber">{t("customer.vatNumber")}</Label>
          <Input id="vatNumber" {...register("vatNumber")} />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="address">{t("customer.address")}</Label>
        <Input id="address" {...register("address")} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="notes">{t("customer.notes")}</Label>
        <textarea
          id="notes"
          rows={3}
          className="border-input flex w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs"
          {...register("notes")}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="status">{t("customer.status")}</Label>
        <select
          id="status"
          className="border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs"
          {...register("status")}
        >
          <option value="ACTIVE">{t("customer.statusActive")}</option>
          <option value="INACTIVE">{t("customer.statusInactive")}</option>
        </select>
      </div>

      <Button type="submit" disabled={isSubmitting || isPending}>
        {isPending ? submittingLabel : submitLabel}
      </Button>
    </form>
  );
}
