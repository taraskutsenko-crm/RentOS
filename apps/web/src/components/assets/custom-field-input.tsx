"use client";

import { Input, Label } from "@rentos/ui";
import { useTranslation } from "react-i18next";

import type { AssetCustomFieldDefinition } from "../../types/asset";

export interface CustomFieldInputProps {
  definition: AssetCustomFieldDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
  error?: string | undefined;
}

export function CustomFieldInput({ definition, value, onChange, error }: CustomFieldInputProps) {
  const { t } = useTranslation();
  const inputId = `custom-field-${definition.key}`;

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={inputId}>
        {definition.name}
        {definition.isRequired && <span className="text-destructive"> *</span>}
      </Label>
      {renderControl()}
      {error && <p className="text-destructive text-sm">{error}</p>}
    </div>
  );

  function renderControl() {
    switch (definition.fieldType) {
      case "TEXTAREA":
        return (
          <textarea
            id={inputId}
            rows={3}
            className="border-input flex w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs"
            value={typeof value === "string" ? value : ""}
            onChange={(event) => onChange(event.target.value)}
          />
        );
      case "BOOLEAN":
        return (
          <label className="flex items-center gap-2 text-sm">
            <input
              id={inputId}
              type="checkbox"
              checked={value === true}
              onChange={(event) => onChange(event.target.checked)}
            />
            {t("asset.fields.booleanYes")}
          </label>
        );
      case "INTEGER":
      case "DECIMAL":
        return (
          <Input
            id={inputId}
            type="number"
            step={definition.fieldType === "INTEGER" ? 1 : "any"}
            value={typeof value === "number" ? value : ""}
            onChange={(event) =>
              onChange(event.target.value === "" ? undefined : Number(event.target.value))
            }
          />
        );
      case "DATE":
        return (
          <Input
            id={inputId}
            type="date"
            value={typeof value === "string" ? value : ""}
            onChange={(event) => onChange(event.target.value)}
          />
        );
      case "DATETIME":
        return (
          <Input
            id={inputId}
            type="datetime-local"
            value={typeof value === "string" ? value : ""}
            onChange={(event) =>
              onChange(event.target.value ? new Date(event.target.value).toISOString() : "")
            }
          />
        );
      case "SELECT":
        return (
          <select
            id={inputId}
            className="border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs"
            value={typeof value === "string" ? value : ""}
            onChange={(event) => onChange(event.target.value)}
          >
            <option value="">{t("asset.fields.selectPlaceholder")}</option>
            {(definition.options ?? []).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        );
      case "MULTISELECT": {
        const selected = Array.isArray(value) ? (value as string[]) : [];
        return (
          <div className="flex flex-col gap-1 rounded-md border p-2">
            {(definition.options ?? []).map((option) => (
              <label key={option.value} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selected.includes(option.value)}
                  onChange={(event) => {
                    if (event.target.checked) {
                      onChange([...selected, option.value]);
                    } else {
                      onChange(selected.filter((entry) => entry !== option.value));
                    }
                  }}
                />
                {option.label}
              </label>
            ))}
          </div>
        );
      }
      case "EMAIL":
        return (
          <Input
            id={inputId}
            type="email"
            value={typeof value === "string" ? value : ""}
            onChange={(event) => onChange(event.target.value)}
          />
        );
      case "URL":
        return (
          <Input
            id={inputId}
            type="url"
            value={typeof value === "string" ? value : ""}
            onChange={(event) => onChange(event.target.value)}
          />
        );
      case "PHONE":
        return (
          <Input
            id={inputId}
            type="tel"
            value={typeof value === "string" ? value : ""}
            onChange={(event) => onChange(event.target.value)}
          />
        );
      case "TEXT":
      default:
        return (
          <Input
            id={inputId}
            type="text"
            value={typeof value === "string" ? value : ""}
            onChange={(event) => onChange(event.target.value)}
          />
        );
    }
  }
}
