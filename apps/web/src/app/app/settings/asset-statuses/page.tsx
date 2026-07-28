"use client";

import { Button, Card, CardContent, Input } from "@rentos/ui";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  useAssetStatuses,
  useCreateAssetStatus,
  useDeleteAssetStatus,
  useUpdateAssetStatus,
} from "../../../../hooks/use-asset-statuses";
import { useCurrentTenantId } from "../../../../hooks/use-current-tenant";
import { usePermission } from "../../../../hooks/use-current-tenant-role";
import { apiErrorMessage } from "../../../../lib/api-error-i18n";

export default function AssetStatusesSettingsPage() {
  const { t } = useTranslation();
  const [tenantId] = useCurrentTenantId();
  const canManage = usePermission("asset_statuses.manage");
  const { data: statuses, isLoading } = useAssetStatuses(tenantId);
  const createStatus = useCreateAssetStatus(tenantId);
  const updateStatus = useUpdateAssetStatus(tenantId);
  const deleteStatus = useDeleteAssetStatus(tenantId);

  const [newName, setNewName] = useState("");
  const [newCode, setNewCode] = useState("");
  const [newAvailableForRental, setNewAvailableForRental] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleCreate(): Promise<void> {
    if (!newName.trim() || !newCode.trim()) return;
    setFormError(null);
    try {
      await createStatus.mutateAsync({
        name: newName.trim(),
        code: newCode.trim().toUpperCase(),
        isAvailableForRental: newAvailableForRental,
      });
      setNewName("");
      setNewCode("");
      setNewAvailableForRental(false);
    } catch (error) {
      setFormError(apiErrorMessage(error, t("common.error")));
    }
  }

  async function handleToggleRentalAvailability(id: string, current: boolean): Promise<void> {
    await updateStatus.mutateAsync({ id, input: { isAvailableForRental: !current } });
  }

  async function handleDelete(id: string): Promise<void> {
    if (!window.confirm(t("asset.statusSettings.deleteConfirm"))) return;
    try {
      await deleteStatus.mutateAsync(id);
    } catch (error) {
      window.alert(apiErrorMessage(error, t("common.error")));
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("asset.statusSettings.title")}</h1>
        <p className="text-muted-foreground text-sm">{t("asset.statusSettings.subtitle")}</p>
      </div>

      {canManage && (
        <Card>
          <CardContent className="flex flex-wrap items-end gap-3 p-4">
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">{t("asset.statusSettings.name")}</span>
              <Input value={newName} onChange={(event) => setNewName(event.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">{t("asset.statusSettings.code")}</span>
              <Input
                value={newCode}
                onChange={(event) => setNewCode(event.target.value.toUpperCase())}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={newAvailableForRental}
                onChange={(event) => setNewAvailableForRental(event.target.checked)}
              />
              {t("asset.statusSettings.availableForRental")}
            </label>
            <Button onClick={() => void handleCreate()} disabled={createStatus.isPending}>
              {t("asset.statusSettings.create")}
            </Button>
            {formError && <p className="text-destructive w-full text-sm">{formError}</p>}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          {isLoading && <p className="text-muted-foreground p-4 text-sm">{t("common.loading")}</p>}
          {!isLoading && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="p-3 font-medium">{t("asset.statusSettings.name")}</th>
                  <th className="p-3 font-medium">{t("asset.statusSettings.code")}</th>
                  <th className="p-3 font-medium">{t("asset.statusSettings.type")}</th>
                  <th className="p-3 font-medium">
                    {t("asset.statusSettings.availableForRental")}
                  </th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody>
                {statuses?.map((status) => (
                  <tr key={status.id} className="border-b last:border-0">
                    <td className="p-3">{status.name}</td>
                    <td className="p-3">
                      <code className="text-xs">{status.code}</code>
                    </td>
                    <td className="p-3">
                      {status.isSystem
                        ? t("asset.statusSettings.systemStatus")
                        : t("asset.statusSettings.customStatus")}
                    </td>
                    <td className="p-3">
                      {canManage ? (
                        <input
                          type="checkbox"
                          checked={status.isAvailableForRental}
                          onChange={() =>
                            void handleToggleRentalAvailability(
                              status.id,
                              status.isAvailableForRental,
                            )
                          }
                        />
                      ) : status.isAvailableForRental ? (
                        t("asset.rentableYes")
                      ) : (
                        t("asset.rentableNo")
                      )}
                    </td>
                    <td className="p-3 text-right">
                      {canManage && !status.isSystem && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void handleDelete(status.id)}
                        >
                          {t("customer.delete")}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
