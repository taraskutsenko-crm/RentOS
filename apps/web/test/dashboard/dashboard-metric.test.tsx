import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DashboardMetric } from "../../src/components/dashboard";
import { renderWithProviders } from "../test-utils";

describe("DashboardMetric", () => {
  it("renders a genuine zero as '0', never blank", () => {
    renderWithProviders(<DashboardMetric label="Customers" value={0} />);

    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.getByText("Customers")).toBeInTheDocument();
  });

  it("shows an accessible loading status instead of the value while loading", () => {
    renderWithProviders(<DashboardMetric label="Customers" value={5} isLoading />);

    expect(screen.queryByText("5")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("renders an em dash instead of the value on error", () => {
    renderWithProviders(<DashboardMetric label="Customers" value={5} isError />);

    expect(screen.queryByText("5")).not.toBeInTheDocument();
    expect(screen.getByText("—", { exact: false })).toBeInTheDocument();
  });

  it("links the card to href only once loaded", () => {
    renderWithProviders(<DashboardMetric label="Customers" value={5} href="/app/customers" />);

    expect(screen.getByRole("link")).toHaveAttribute("href", "/app/customers");
  });
});
