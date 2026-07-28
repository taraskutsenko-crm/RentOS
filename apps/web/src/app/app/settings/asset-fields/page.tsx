"use client";

import { Button, Card, CardContent, Input } from "@rentos/ui";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useAssetCategories } from "../../../../hooks/use-asset-categories";
import {
  useAssetCustomFields,
  useCreateAssetCustomField,
  useDeleteAssetCustomField,
} from "../../../../hooks/use-asset-custom-fields";
import { useCurrentTenantId } from "../../../../hooks/use-current-tenant";
import { usePermission } from "../../../../hooks/use-current-tenant-role";
import { apiErrorMessage } from "../../../../lib/api-error-i18n";
import type { AssetFieldType } from "../../../../types/asset";

const FIELD_TYPES: AssetFieldType[] = [
  "TEXT",
  "TEXTAREA",
  "INTEGER",
  "DECIMAL",
  "BOOLEAN",
  "DATE",
  "DATETIME",
  "SELECT",
  "MULTISELECT",
  "URL",
  "EMAIL",
  "PHONE",
];

const CHOICE_TYPES: AssetFieldType[] = ["SELECT", "MULTISELECT"];

export default function AssetFieldsSettingsPage() {
  const { t } = useTranslation();
  const [tenantId] = useCurrentTenantId();
  const canManage = usePermission("asset_fields.manage");
  const { data: fields, isLoading } = useAssetCustomFields(tenantId);
  const { data: categories } = useAssetCategories(tenantId);
  const createField = useCreateAssetCustomField(tenantId);
  const deleteField = useDeleteAssetCustomField(tenantId);

  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [fieldType, setFieldType] = useState<AssetFieldType>("TEXT");
  const [isRequired, setIsRequired] = useState(false);
  const [isFilterable, setIsFilterable] = useState(false);
  const [isSearchable, setIsSearchable] = useState(false);
  const [optionsText, setOptionsText] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  async function handleCreate(): Promise<void> {
    if (!name.trim() || !key.trim()) return;
    setFormError(null);
    try {
      const options = CHOICE_TYPES.includes(fieldType)
        ? optionsText
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line) => ({ value: line, label: line }))
        : undefined;

      await createField.mutateAsync({
        name: name.trim(),
        key: key.trim(),
        categoryId: categoryId || null,
        fieldType,
        isRequired,
        isFilterable,
        isSearchable,
        ...(options ? { options } : {}),
      });
      setName("");
      setKey("");
      setCategoryId("");
      setFieldType("TEXT");
      setIsRequired(false);
      setIsFilterable(false);
      setIsSearchable(false);
      setOptionsText("");
    } catch (error) {
      setFormError(apiErrorMessage(error, t("common.error")));
    }
  }

  async function handleDelete(id: string): Promise<void> {
    if (!window.confirm(t("asset.fieldSettings.deleteConfirm"))) return;
    try {
      await deleteField.mutateAsync(id);
    } catch (error) {
      window.alert(apiErrorMessage(error, t("common.error")));
    }
  }

  const categoryNameById = new Map(
    (categories?.items ?? []).map((category) => [category.id, category.name]),
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("asset.fieldSettings.title")}</h1>
        <p className="text-muted-foreground text-sm">{t("asset.fieldSettings.subtitle")}</p>
      </div>

      {canManage && (
        <Card>
          <CardContent className="flex flex-col gap-3 p-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">{t("asset.fieldSettings.name")}</span>
                <Input value={name} onChange={(event) => setName(event.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">{t("asset.fieldSettings.key")}</span>
                <Input value={key} onChange={(event) => setKey(event.target.value.toLowerCase())} />
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">{t("asset.fieldSettings.category")}</span>
                <select
                  className="border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs"
                  value={categoryId}
                  onChange={(event) => setCategoryId(event.target.value)}
                >
                  <option value="">{t("asset.fieldSettings.globalField")}</option>
                  {categories?.items.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">{t("asset.fieldSettings.fieldType")}</span>
                <select
                  className="border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs"
                  value={fieldType}
                  onChange={(event) => setFieldType(event.target.value as AssetFieldType)}
                >
                  {FIELD_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {t(`asset.fieldTypes.${type}`)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {CHOICE_TYPES.includes(fieldType) && (
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">{t("asset.fieldSettings.optionsHint")}</span>
                <textarea
                  rows={3}
                  className="border-input flex w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs"
                  value={optionsText}
                  onChange={(event) => setOptionsText(event.target.value)}
                />
              </div>
            )}

            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={isRequired}
                  onChange={(event) => setIsRequired(event.target.checked)}
                />
                {t("asset.fieldSettings.required")}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={isFilterable}
                  onChange={(event) => setIsFilterable(event.target.checked)}
                />
                {t("asset.fieldSettings.filterable")}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={isSearchable}
                  onChange={(event) => setIsSearchable(event.target.checked)}
                />
                {t("asset.fieldSettings.searchable")}
              </label>
            </div>

            <Button
              onClick={() => void handleCreate()}
              disabled={createField.isPending}
              className="w-fit"
            >
              {t("asset.fieldSettings.create")}
            </Button>
            {formError && <p className="text-destructive text-sm">{formError}</p>}
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
                  <th className="p-3 font-medium">{t("asset.fieldSettings.name")}</th>
                  <th className="p-3 font-medium">{t("asset.fieldSettings.key")}</th>
                  <th className="p-3 font-medium">{t("asset.fieldSettings.fieldType")}</th>
                  <th className="p-3 font-medium">{t("asset.fieldSettings.category")}</th>
                  <th className="p-3 font-medium">{t("asset.fieldSettings.required")}</th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody>
                {fields?.items.map((field) => (
                  <tr key={field.id} className="border-b last:border-0">
                    <td className="p-3">{field.name}</td>
                    <td className="p-3">
                      <code className="text-xs">{field.key}</code>
                    </td>
                    <td className="p-3">{t(`asset.fieldTypes.${field.fieldType}`)}</td>
                    <td className="p-3">
                      {field.categoryId
                        ? (categoryNameById.get(field.categoryId) ?? "—")
                        : t("asset.fieldSettings.globalField")}
                    </td>
                    <td className="p-3">
                      {field.isRequired ? t("asset.rentableYes") : t("asset.rentableNo")}
                    </td>
                    <td className="p-3 text-right">
                      {canManage && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void handleDelete(field.id)}
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
