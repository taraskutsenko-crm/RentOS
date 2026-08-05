import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { DataTable } from "../../src/components/data-table/data-table";
import type { DataTableColumn, SortState } from "../../src/components/data-table/types";
import { renderWithProviders } from "../test-utils";

interface Row {
  id: string;
  name: string;
}

const columns: DataTableColumn<Row>[] = [
  { id: "name", header: "Name", cell: (row) => row.name, sortable: true },
];

const rows: Row[] = [
  { id: "1", name: "Bravo" },
  { id: "2", name: "Alpha" },
];

/**
 * Shared behaviors every migrated list page depends on — see
 * docs/UI_REDESIGN_PLAN.md Chapter 3. Covering these once here means
 * each page's own test only needs to cover its column mapping, not
 * re-prove loading/error/empty/sort/selection from scratch.
 */
describe("DataTable", () => {
  it("renders a skeleton while loading", () => {
    renderWithProviders(
      <DataTable
        columns={columns}
        data={undefined}
        getRowId={(row) => row.id}
        isLoading
        emptyState={<p>empty</p>}
      />,
    );

    expect(screen.getByRole("status", { name: /loading/i })).toBeInTheDocument();
  });

  it("renders an error message with a retry button that calls onRetry", async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <DataTable
        columns={columns}
        data={undefined}
        getRowId={(row) => row.id}
        isError
        onRetry={onRetry}
        emptyState={<p>empty</p>}
      />,
    );

    await user.click(screen.getByRole("button", { name: /retry/i }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("renders the permission-denied state instead of any data", () => {
    renderWithProviders(
      <DataTable
        columns={columns}
        data={rows}
        getRowId={(row) => row.id}
        permissionDenied
        emptyState={<p>empty</p>}
      />,
    );

    expect(screen.queryByText("Bravo")).not.toBeInTheDocument();
    expect(screen.getByText(/don't have permission/i)).toBeInTheDocument();
  });

  it("renders the caller-provided empty state when there is no data", () => {
    renderWithProviders(
      <DataTable
        columns={columns}
        data={[]}
        getRowId={(row) => row.id}
        emptyState={<p>Nothing here yet</p>}
      />,
    );

    expect(screen.getByText("Nothing here yet")).toBeInTheDocument();
  });

  it("cycles a sortable column through unsorted → asc → desc → unsorted on repeated clicks", async () => {
    const user = userEvent.setup();
    let sort: SortState = { sortBy: null, sortDirection: "asc" };
    const onSortChange = vi.fn((next: SortState) => {
      sort = next;
    });

    const { rerender } = renderWithProviders(
      <DataTable
        columns={columns}
        data={rows}
        getRowId={(row) => row.id}
        sort={sort}
        onSortChange={onSortChange}
        emptyState={<p>empty</p>}
      />,
    );

    const header = screen.getByRole("button", { name: /^name$/i });
    await user.click(header);
    expect(onSortChange).toHaveBeenLastCalledWith({ sortBy: "name", sortDirection: "asc" });

    rerender(
      <DataTable
        columns={columns}
        data={rows}
        getRowId={(row) => row.id}
        sort={sort}
        onSortChange={onSortChange}
        emptyState={<p>empty</p>}
      />,
    );
    await user.click(screen.getByRole("button", { name: /^name$/i }));
    expect(onSortChange).toHaveBeenLastCalledWith({ sortBy: "name", sortDirection: "desc" });

    rerender(
      <DataTable
        columns={columns}
        data={rows}
        getRowId={(row) => row.id}
        sort={sort}
        onSortChange={onSortChange}
        emptyState={<p>empty</p>}
      />,
    );
    await user.click(screen.getByRole("button", { name: /^name$/i }));
    expect(onSortChange).toHaveBeenLastCalledWith({ sortBy: null, sortDirection: "asc" });
  });

  it("selecting all rows and then one row keeps selection state consistent", async () => {
    const user = userEvent.setup();
    let selectedIds = new Set<string>();
    const onSelectionChange = vi.fn((next: Set<string>) => {
      selectedIds = next;
    });

    const { rerender } = renderWithProviders(
      <DataTable
        columns={columns}
        data={rows}
        getRowId={(row) => row.id}
        selection={{ selectedIds, onSelectionChange }}
        emptyState={<p>empty</p>}
      />,
    );

    await user.click(screen.getByRole("checkbox", { name: /select all/i }));
    expect(onSelectionChange).toHaveBeenLastCalledWith(new Set(["1", "2"]));

    rerender(
      <DataTable
        columns={columns}
        data={rows}
        getRowId={(row) => row.id}
        selection={{ selectedIds, onSelectionChange }}
        emptyState={<p>empty</p>}
      />,
    );
    await user.click(screen.getAllByRole("checkbox", { name: /select row/i })[0]!);
    expect(onSelectionChange).toHaveBeenLastCalledWith(new Set(["2"]));
  });

  it("makes a row clickable to rowHref and renders row-actions inside an overflow menu", async () => {
    const onDelete = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <DataTable
        columns={columns}
        data={rows}
        getRowId={(row) => row.id}
        rowHref={(row) => `/things/${row.id}`}
        rowActions={(row) => (
          <button type="button" onClick={() => onDelete(row.id)}>
            Delete
          </button>
        )}
        emptyState={<p>empty</p>}
      />,
    );

    expect(screen.getByRole("link", { name: "Bravo" })).toHaveAttribute("href", "/things/1");

    await user.click(screen.getAllByRole("button", { name: /row actions/i })[0]!);
    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(onDelete).toHaveBeenCalledWith("1");
  });
});
