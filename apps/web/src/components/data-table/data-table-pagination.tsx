"use client";

import { Button } from "@rentos/ui";
import { useTranslation } from "react-i18next";

export interface DataTablePaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

/** The one pagination footer every list page uses — see docs/UI_AUDIT.md finding #21. */
export function DataTablePagination({
  page,
  pageSize,
  total,
  onPageChange,
}: DataTablePaginationProps) {
  const { t } = useTranslation();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if (total === 0) return null;

  const rangeStart = (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground text-sm">
        {t("common.pagination.range", { start: rangeStart, end: rangeEnd, total })}
      </span>
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(Math.max(1, page - 1))}
        >
          {t("common.pagination.previous")}
        </Button>
        <span className="text-muted-foreground text-sm">
          {t("common.pagination.pageOf", { page, totalPages })}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
        >
          {t("common.pagination.next")}
        </Button>
      </div>
    </div>
  );
}
