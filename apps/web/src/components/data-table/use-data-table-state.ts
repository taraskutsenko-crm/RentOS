"use client";

import { useEffect, useState } from "react";

import type { SortDirection, SortState } from "./types";

export interface UseDataTableStateOptions {
  pageSize?: number;
  debounceMs?: number;
  initialSortBy?: string | null;
  initialSortDirection?: SortDirection;
}

export interface UseDataTableStateResult {
  page: number;
  goToPage: (page: number) => void;
  pageSize: number;
  searchInput: string;
  setSearchInput: (value: string) => void;
  search: string;
  sort: SortState;
  setSort: (next: SortState) => void;
  selectedIds: Set<string>;
  setSelectedIds: (ids: Set<string>) => void;
  /** Any page-specific filter (status, customer, date range, ...) should call this alongside its own setter. */
  resetToFirstPage: () => void;
}

/**
 * Consolidated page/search/sort/selection state every migrated list page
 * shares — replaces each page's own hand-rolled `useState` + `setTimeout`
 * debounce (previously duplicated 7 times, see docs/UI_AUDIT.md finding
 * #15). Page-specific filter fields (status, customer, date range) stay
 * local `useState` in the page itself and call `resetToFirstPage()`.
 */
export function useDataTableState(options: UseDataTableStateOptions = {}): UseDataTableStateResult {
  const {
    pageSize = 20,
    debounceMs = 300,
    initialSortBy = null,
    initialSortDirection = "asc",
  } = options;

  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSortState] = useState<SortState>({
    sortBy: initialSortBy,
    sortDirection: initialSortDirection,
  });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const id = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, debounceMs);
    return () => window.clearTimeout(id);
  }, [searchInput, debounceMs]);

  function goToPage(next: number): void {
    setPage(next);
    setSelectedIds(new Set());
  }

  function setSort(next: SortState): void {
    setSortState(next);
    setPage(1);
  }

  function resetToFirstPage(): void {
    setPage(1);
    setSelectedIds(new Set());
  }

  return {
    page,
    goToPage,
    pageSize,
    searchInput,
    setSearchInput,
    search,
    sort,
    setSort,
    selectedIds,
    setSelectedIds,
    resetToFirstPage,
  };
}
