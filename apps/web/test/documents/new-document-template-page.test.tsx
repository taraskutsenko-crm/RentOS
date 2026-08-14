import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import NewDocumentTemplatePage from "../../src/app/app/documents/templates/new/page";
import { renderWithProviders } from "../test-utils";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const useCurrentTenantIdMock = vi.fn();
vi.mock("../../src/hooks/use-current-tenant", () => ({
  useCurrentTenantId: () => useCurrentTenantIdMock(),
}));

const previewMutateAsyncMock = vi.fn();
vi.mock("../../src/hooks/use-document-templates", () => ({
  useCreateDocumentTemplate: () => ({ mutateAsync: vi.fn(), isPending: false }),
  usePreviewDocumentTemplate: () => ({
    mutateAsync: previewMutateAsyncMock,
    isPending: false,
  }),
}));

describe("NewDocumentTemplatePage preview wiring", () => {
  beforeEach(() => {
    useCurrentTenantIdMock.mockReturnValue(["tenant-1", vi.fn()]);
    previewMutateAsyncMock.mockReset();
    previewMutateAsyncMock.mockResolvedValue({ html: "<h1>Acme Rentals</h1>" });
  });

  it("previews the Advanced-mode draft content against synthetic sample data", async () => {
    const user = userEvent.setup();
    renderWithProviders(<NewDocumentTemplatePage />);

    // Advanced mode has a stable default htmlContent value that doesn't
    // require driving the Tiptap editor to produce non-empty content.
    await user.click(screen.getByRole("button", { name: "Advanced (HTML/CSS)" }));
    await user.click(screen.getByRole("button", { name: "Preview" }));

    expect(previewMutateAsyncMock).toHaveBeenCalledWith({
      documentType: "CONTRACT",
      htmlContent: "<h1>{{company.name}}</h1>\n<p>{{customer.name}}</p>\n<p>{{today}}</p>",
      css: null,
    });

    const iframe = (await screen.findByTitle("Preview")) as HTMLIFrameElement;
    expect(iframe.srcdoc).toContain("Acme Rentals");
  });

  it("applies the starter template directly when the canvas is still untouched", async () => {
    const user = userEvent.setup();
    renderWithProviders(<NewDocumentTemplatePage />);

    await user.click(
      screen.getByRole("button", { name: "Start from Havelio Rental Contract template" }),
    );

    // No confirmation dialog since nothing had been typed yet.
    expect(screen.queryByText("Replace current content?")).not.toBeInTheDocument();
    const canvas = document.querySelector(".doc-builder-canvas") as HTMLElement;
    expect(await within(canvas).findByText("Parties")).toBeInTheDocument();
  });

  it("confirms before overwriting an already-edited canvas with the starter template", async () => {
    const user = userEvent.setup();
    renderWithProviders(<NewDocumentTemplatePage />);

    await user.click(await screen.findByText("Insert field"));
    await user.click(await screen.findByRole("menuitem", { name: "Rental total" }));

    await user.click(
      screen.getByRole("button", { name: "Start from Havelio Rental Contract template" }),
    );
    expect(await screen.findByText("Replace current content?")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Confirm" }));

    const canvas = document.querySelector(".doc-builder-canvas") as HTMLElement;
    expect(await within(canvas).findByText("Parties")).toBeInTheDocument();
    expect(screen.queryByText("Replace current content?")).not.toBeInTheDocument();
  });
});
