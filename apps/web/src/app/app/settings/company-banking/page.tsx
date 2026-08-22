"use client";

import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
} from "@rentos/ui";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  type BankAccountInput,
  useBankAccounts,
  useCreateBankAccount,
  useDeactivateBankAccount,
  useUpdateBankAccount,
} from "../../../../hooks/use-bank-accounts";
import { useCurrentTenantId } from "../../../../hooks/use-current-tenant";
import { usePermission } from "../../../../hooks/use-current-tenant-role";
import { apiErrorMessage } from "../../../../lib/api-error-i18n";
import type { CompanyBankAccount } from "../../../../types/bank-account";

const CURRENCIES = ["USD", "EUR", "PLN", "GBP", "UAH", "CZK", "RUB"];

const EMPTY_FORM: BankAccountInput = {
  label: "",
  bankName: "",
  accountHolder: "",
  accountNumber: "",
  iban: "",
  swiftBic: "",
  currency: "USD",
  bankAddress: "",
  paymentReference: "",
  isDefault: false,
};

export default function CompanyBankingSettingsPage() {
  const { t } = useTranslation();
  const [tenantId] = useCurrentTenantId();
  const canManage = usePermission("bankAccounts.manage");

  const { data: accounts, isLoading } = useBankAccounts(tenantId, true);
  const createAccount = useCreateBankAccount(tenantId);
  const updateAccount = useUpdateBankAccount(tenantId);
  const deactivateAccount = useDeactivateBankAccount(tenantId);

  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<BankAccountInput>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  function openCreate(): void {
    setForm(EMPTY_FORM);
    setFormError(null);
    setEditingId("new");
  }

  function openEdit(account: CompanyBankAccount): void {
    setForm({
      label: account.label,
      bankName: account.bankName ?? "",
      accountHolder: account.accountHolder ?? "",
      accountNumber: account.accountNumber ?? "",
      iban: account.iban ?? "",
      swiftBic: account.swiftBic ?? "",
      currency: account.currency,
      bankAddress: account.bankAddress ?? "",
      paymentReference: account.paymentReference ?? "",
      isDefault: account.isDefault,
    });
    setFormError(null);
    setEditingId(account.id);
  }

  async function handleSubmit(): Promise<void> {
    if (!form.label.trim() || !form.currency) return;
    setFormError(null);
    try {
      if (editingId === "new") {
        await createAccount.mutateAsync(form);
      } else if (editingId) {
        await updateAccount.mutateAsync({ id: editingId, input: form });
      }
      setEditingId(null);
    } catch (error) {
      setFormError(apiErrorMessage(error, t("common.error")));
    }
  }

  async function handleSetDefault(account: CompanyBankAccount): Promise<void> {
    await updateAccount.mutateAsync({ id: account.id, input: { isDefault: true } });
  }

  async function handleDeactivate(account: CompanyBankAccount): Promise<void> {
    if (!window.confirm(t("bankAccount.deactivateConfirm"))) return;
    try {
      await deactivateAccount.mutateAsync(account.id);
    } catch (error) {
      window.alert(apiErrorMessage(error, t("common.error")));
    }
  }

  const isSaving = createAccount.isPending || updateAccount.isPending;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t("bankAccount.settings.title")}</h1>
          <p className="text-muted-foreground text-sm">{t("bankAccount.settings.subtitle")}</p>
        </div>
        {canManage && <Button onClick={openCreate}>{t("bankAccount.add")}</Button>}
      </div>

      {isLoading && <p className="text-muted-foreground text-sm">{t("common.loading")}</p>}

      {!isLoading && accounts?.length === 0 && (
        <Card>
          <CardContent className="p-6">
            <p className="text-muted-foreground text-sm">{t("bankAccount.empty")}</p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {accounts?.map((account) => (
          <Card key={account.id} className={account.isActive ? "" : "opacity-60"}>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-base">
                {account.label}
                {account.isDefault && (
                  <span className="bg-primary text-primary-foreground rounded-full px-2 py-0.5 text-xs">
                    {t("bankAccount.default")}
                  </span>
                )}
                {!account.isActive && (
                  <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs">
                    {t("bankAccount.inactive")}
                  </span>
                )}
              </CardTitle>
              <span className="text-muted-foreground text-xs">{account.currency}</span>
            </CardHeader>
            <CardContent className="flex flex-col gap-1 text-sm">
              {account.bankName && <p>{account.bankName}</p>}
              {account.iban && (
                <p className="text-muted-foreground">
                  {t("bankAccount.fields.iban")}: {account.iban}
                </p>
              )}
              {account.swiftBic && (
                <p className="text-muted-foreground">
                  {t("bankAccount.fields.swiftBic")}: {account.swiftBic}
                </p>
              )}
              {canManage && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => openEdit(account)}>
                    {t("common.edit")}
                  </Button>
                  {account.isActive && !account.isDefault && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void handleSetDefault(account)}
                    >
                      {t("bankAccount.setDefault")}
                    </Button>
                  )}
                  {account.isActive && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void handleDeactivate(account)}
                    >
                      {t("bankAccount.deactivate")}
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={editingId !== null} onOpenChange={(open) => !open && setEditingId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingId === "new" ? t("bankAccount.add") : t("bankAccount.edit")}
            </DialogTitle>
          </DialogHeader>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              void handleSubmit();
            }}
            className="flex flex-col gap-4"
          >
            {formError && <p className="text-destructive text-sm">{formError}</p>}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="label">{t("bankAccount.fields.label")}</Label>
              <Input
                id="label"
                value={form.label}
                onChange={(event) => setForm({ ...form, label: event.target.value })}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="bankName">{t("bankAccount.fields.bankName")}</Label>
                <Input
                  id="bankName"
                  value={form.bankName ?? ""}
                  onChange={(event) => setForm({ ...form, bankName: event.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="currency">{t("bankAccount.fields.currency")}</Label>
                <Select
                  id="currency"
                  value={form.currency}
                  onChange={(event) => setForm({ ...form, currency: event.target.value })}
                  required
                >
                  {CURRENCIES.map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="accountHolder">{t("bankAccount.fields.accountHolder")}</Label>
              <Input
                id="accountHolder"
                value={form.accountHolder ?? ""}
                onChange={(event) => setForm({ ...form, accountHolder: event.target.value })}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="accountNumber">{t("bankAccount.fields.accountNumber")}</Label>
              <Input
                id="accountNumber"
                value={form.accountNumber ?? ""}
                onChange={(event) => setForm({ ...form, accountNumber: event.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="iban">{t("bankAccount.fields.iban")}</Label>
                <Input
                  id="iban"
                  value={form.iban ?? ""}
                  onChange={(event) => setForm({ ...form, iban: event.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="swiftBic">{t("bankAccount.fields.swiftBic")}</Label>
                <Input
                  id="swiftBic"
                  value={form.swiftBic ?? ""}
                  onChange={(event) => setForm({ ...form, swiftBic: event.target.value })}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bankAddress">{t("bankAccount.fields.bankAddress")}</Label>
              <Input
                id="bankAddress"
                value={form.bankAddress ?? ""}
                onChange={(event) => setForm({ ...form, bankAddress: event.target.value })}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="paymentReference">{t("bankAccount.fields.paymentReference")}</Label>
              <Input
                id="paymentReference"
                value={form.paymentReference ?? ""}
                onChange={(event) => setForm({ ...form, paymentReference: event.target.value })}
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                id="isDefault"
                type="checkbox"
                checked={form.isDefault ?? false}
                onChange={(event) => setForm({ ...form, isDefault: event.target.checked })}
                className="size-4"
              />
              <Label htmlFor="isDefault">{t("bankAccount.setAsDefault")}</Label>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditingId(null)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? t("common.saving") : t("common.save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
