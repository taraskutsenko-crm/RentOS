import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { RecentActivity } from "../../src/components/dashboard";
import { renderWithProviders } from "../test-utils";

interface Row {
  id: string;
  label: string;
}

describe("RecentActivity", () => {
  it("shows an accessible loading status while loading", () => {
    renderWithProviders(
      <RecentActivity<Row>
        items={[]}
        getRowId={(row) => row.id}
        renderRow={(row) => row.label}
        isLoading
        emptyMessage="No items"
        errorMessage="Error"
        loadingLabel="Loading…"
      />,
    );

    expect(screen.getByLabelText(/loading/i)).toBeInTheDocument();
  });

  it("shows the empty state when there are genuinely no items", () => {
    renderWithProviders(
      <RecentActivity<Row>
        items={[]}
        getRowId={(row) => row.id}
        renderRow={(row) => row.label}
        emptyMessage="No items yet"
        errorMessage="Error"
        loadingLabel="Loading…"
      />,
    );

    expect(screen.getByText("No items yet")).toBeInTheDocument();
  });

  it("renders each real item via the caller-provided row renderer", () => {
    renderWithProviders(
      <RecentActivity<Row>
        items={[
          { id: "1", label: "First item" },
          { id: "2", label: "Second item" },
        ]}
        getRowId={(row) => row.id}
        renderRow={(row) => row.label}
        emptyMessage="No items"
        errorMessage="Error"
        loadingLabel="Loading…"
      />,
    );

    expect(screen.getByText("First item")).toBeInTheDocument();
    expect(screen.getByText("Second item")).toBeInTheDocument();
  });

  it("shows an error message with a retry action", async () => {
    const onRetry = vi.fn();
    renderWithProviders(
      <RecentActivity<Row>
        items={[]}
        getRowId={(row) => row.id}
        renderRow={(row) => row.label}
        isError
        emptyMessage="No items"
        errorMessage="Something went wrong"
        loadingLabel="Loading…"
        retryLabel="Retry"
        onRetry={onRetry}
      />,
    );

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
