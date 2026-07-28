"use client";

import { Button, Card, CardContent, Input } from "@rentos/ui";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  useAssetCategoryTree,
  useCreateAssetCategory,
  useDeleteAssetCategory,
  useUpdateAssetCategory,
} from "../../../../hooks/use-asset-categories";
import { useCurrentTenantId } from "../../../../hooks/use-current-tenant";
import { usePermission } from "../../../../hooks/use-current-tenant-role";
import { apiErrorMessage } from "../../../../lib/api-error-i18n";
import type { AssetCategoryTreeNode } from "../../../../types/asset";

export default function AssetCategoriesSettingsPage() {
  const { t } = useTranslation();
  const [tenantId] = useCurrentTenantId();
  const canManage = usePermission("asset_categories.manage");
  const { data: tree, isLoading } = useAssetCategoryTree(tenantId);
  const createCategory = useCreateAssetCategory(tenantId);
  const updateCategory = useUpdateAssetCategory(tenantId);
  const deleteCategory = useDeleteAssetCategory(tenantId);

  const [newName, setNewName] = useState("");
  const [newParentId, setNewParentId] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  async function handleCreate(): Promise<void> {
    if (!newName.trim()) return;
    setFormError(null);
    try {
      await createCategory.mutateAsync({ name: newName.trim(), parentId: newParentId || null });
      setNewName("");
      setNewParentId("");
    } catch (error) {
      setFormError(apiErrorMessage(error, t("common.error")));
    }
  }

  async function handleToggleActive(id: string, isActive: boolean): Promise<void> {
    await updateCategory.mutateAsync({ id, input: { isActive: !isActive } });
  }

  async function handleDelete(id: string): Promise<void> {
    if (!window.confirm(t("asset.categorySettings.deleteConfirm"))) return;
    try {
      await deleteCategory.mutateAsync(id);
    } catch (error) {
      window.alert(apiErrorMessage(error, t("common.error")));
    }
  }

  function renderNode(node: AssetCategoryTreeNode, depth: number) {
    return (
      <div key={node.id} className="flex flex-col">
        <div
          className="flex items-center justify-between border-b py-2"
          style={{ paddingLeft: `${depth * 20}px` }}
        >
          <span className={node.isActive ? "" : "text-muted-foreground line-through"}>
            {node.name}
          </span>
          {canManage && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleToggleActive(node.id, node.isActive)}
              >
                {node.isActive
                  ? t("asset.categorySettings.deactivate")
                  : t("asset.categorySettings.activate")}
              </Button>
              <Button variant="outline" size="sm" onClick={() => void handleDelete(node.id)}>
                {t("customer.delete")}
              </Button>
            </div>
          )}
        </div>
        {node.children.map((child) => renderNode(child, depth + 1))}
      </div>
    );
  }

  function flattenForParentSelect(
    nodes: AssetCategoryTreeNode[],
    depth = 0,
  ): { id: string; label: string }[] {
    return nodes.flatMap((node) => [
      { id: node.id, label: `${"— ".repeat(depth)}${node.name}` },
      ...flattenForParentSelect(node.children, depth + 1),
    ]);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("asset.categorySettings.title")}</h1>
        <p className="text-muted-foreground text-sm">{t("asset.categorySettings.subtitle")}</p>
      </div>

      {canManage && (
        <Card>
          <CardContent className="flex flex-wrap items-end gap-3 p-4">
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">
                {t("asset.categorySettings.newCategoryName")}
              </span>
              <Input value={newName} onChange={(event) => setNewName(event.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">{t("asset.categorySettings.parent")}</span>
              <select
                className="border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs"
                value={newParentId}
                onChange={(event) => setNewParentId(event.target.value)}
              >
                <option value="">{t("asset.categorySettings.noParent")}</option>
                {tree &&
                  flattenForParentSelect(tree).map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
              </select>
            </div>
            <Button onClick={() => void handleCreate()} disabled={createCategory.isPending}>
              {t("asset.categorySettings.create")}
            </Button>
            {formError && <p className="text-destructive w-full text-sm">{formError}</p>}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-4">
          {isLoading && <p className="text-muted-foreground text-sm">{t("common.loading")}</p>}
          {!isLoading && tree?.length === 0 && (
            <p className="text-muted-foreground text-sm">
              {t("asset.categorySettings.noCategories")}
            </p>
          )}
          {tree?.map((node) => renderNode(node, 0))}
        </CardContent>
      </Card>
    </div>
  );
}
