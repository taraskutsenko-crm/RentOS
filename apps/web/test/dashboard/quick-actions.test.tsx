import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { QuickActions } from "../../src/components/dashboard";
import { renderWithProviders } from "../test-utils";

describe("QuickActions", () => {
  it("hides actions the user lacks permission for, rather than disabling them", () => {
    renderWithProviders(
      <QuickActions
        actions={[
          {
            key: "customer",
            label: "New customer",
            href: "/app/customers/new",
            icon: null,
            visible: true,
          },
          { key: "asset", label: "New asset", href: "/app/assets/new", icon: null, visible: false },
        ]}
      />,
    );

    expect(screen.getByRole("link", { name: /new customer/i })).toBeInTheDocument();
    expect(screen.queryByText(/new asset/i)).not.toBeInTheDocument();
  });

  it("renders nothing when no action is visible", () => {
    const { container } = renderWithProviders(
      <QuickActions
        actions={[
          { key: "asset", label: "New asset", href: "/app/assets/new", icon: null, visible: false },
        ]}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
