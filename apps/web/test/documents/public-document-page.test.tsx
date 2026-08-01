import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../../src/lib/api-client";
import PublicDocumentPage from "../../src/app/share/[token]/page";
import { renderWithProviders } from "../test-utils";

vi.mock("next/navigation", () => ({
  useParams: () => ({ token: "test-token" }),
}));

const useViewPublicDocumentMock = vi.fn();
const useDownloadPublicDocumentPdfMock = vi.fn();
vi.mock("../../src/hooks/use-public-document", () => ({
  useViewPublicDocument: (...args: unknown[]) => useViewPublicDocumentMock(...args),
  useDownloadPublicDocumentPdf: (...args: unknown[]) => useDownloadPublicDocumentPdfMock(...args),
}));

describe("PublicDocumentPage", () => {
  beforeEach(() => {
    useDownloadPublicDocumentPdfMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
  });

  it("shows a loading state while the document is being fetched", () => {
    useViewPublicDocumentMock.mockReturnValue({
      mutate: vi.fn(),
      data: undefined,
      isPending: true,
      isError: false,
      error: undefined,
    });

    renderWithProviders(<PublicDocumentPage />);

    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it("shows a not-found message for an invalid or expired token", () => {
    useViewPublicDocumentMock.mockReturnValue({
      mutate: vi.fn(),
      data: undefined,
      isPending: false,
      isError: true,
      error: new Error("Not Found"),
    });

    renderWithProviders(<PublicDocumentPage />);

    expect(screen.getByText(/this link is invalid or has expired/i)).toBeInTheDocument();
  });

  it("renders the document preview and a download link once resolved", () => {
    useViewPublicDocumentMock.mockReturnValue({
      mutate: vi.fn(),
      data: {
        documentNumber: "DOC-2026-000001",
        documentType: "CONTRACT",
        title: null,
        status: "SENT",
        html: "<h1>Contract</h1>",
      },
      isPending: false,
      isError: false,
      error: undefined,
    });

    renderWithProviders(<PublicDocumentPage />);

    expect(screen.getByText("DOC-2026-000001")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /download pdf/i })).toBeInTheDocument();
  });

  it("prompts for a password when the link is password-protected", async () => {
    const mutateMock = vi.fn((_password, options) => {
      options?.onError?.(new ApiError("A valid password is required to open this link", 403));
    });
    useViewPublicDocumentMock.mockReturnValue({
      mutate: mutateMock,
      data: undefined,
      isPending: false,
      isError: true,
      error: new ApiError("A valid password is required to open this link", 403),
    });

    renderWithProviders(<PublicDocumentPage />);

    await waitFor(() =>
      expect(screen.getByText(/this document is password protected/i)).toBeInTheDocument(),
    );

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/password/i), "secret");
    await user.click(screen.getByRole("button", { name: /unlock/i }));

    expect(mutateMock).toHaveBeenLastCalledWith(
      "secret",
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });
});
