import { fireEvent, render, screen } from "@testing-library/react";
import { SignaturePad } from "@rentos/ui";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * jsdom implements neither a real 2D canvas context nor
 * ResizeObserver/canvas.toBlob — these are the minimal, self-contained
 * stand-ins every canvas-based component test in this ecosystem needs
 * (see docs/PRODUCT_BIBLE.md "Havelio Signature System" — this is the
 * only canvas-drawing component in the codebase, so there is no existing
 * shared mock to reuse). Assertions stay behavioral (did Save become
 * enabled, was onSave called with a File) rather than inspecting drawn
 * pixels, per the task's explicit "no fragile pixel-perfect tests" scope.
 */
const fakeContext = {
  setTransform: vi.fn(),
  clearRect: vi.fn(),
  fillRect: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  stroke: vi.fn(),
  lineCap: "",
  lineJoin: "",
  strokeStyle: "",
  fillStyle: "",
  lineWidth: 0,
};

beforeEach(() => {
  vi.clearAllMocks();

  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    value: 300,
  });

  HTMLCanvasElement.prototype.getContext = vi.fn(() => fakeContext) as never;
  HTMLCanvasElement.prototype.toBlob = vi.fn(function (
    this: HTMLCanvasElement,
    callback: BlobCallback,
  ) {
    callback(new Blob(["fake-png-bytes"], { type: "image/png" }));
  }) as never;
  HTMLCanvasElement.prototype.getBoundingClientRect = vi.fn(
    () => ({ left: 0, top: 0, width: 300, height: 180, right: 300, bottom: 180 }) as DOMRect,
  );
  HTMLCanvasElement.prototype.setPointerCapture = vi.fn();

  // jsdom has no real ResizeObserver implementation at runtime — a
  // synchronous single-callback stub is enough to drive the component's
  // own sizing effect without pulling in a real observer implementation.
  global.ResizeObserver = class {
    private callback: ResizeObserverCallback;
    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
    }
    observe(target: Element) {
      this.callback(
        [{ contentRect: { width: (target as HTMLElement).clientWidth } } as ResizeObserverEntry],
        this as unknown as ResizeObserver,
      );
    }
    unobserve() {}
    disconnect() {}
  };
});

function drawStroke(canvas: HTMLElement, pointerId = 1): void {
  fireEvent.pointerDown(canvas, { pointerId, clientX: 10, clientY: 10, pointerType: "mouse" });
  fireEvent.pointerMove(canvas, { pointerId, clientX: 50, clientY: 60, pointerType: "mouse" });
  fireEvent.pointerMove(canvas, { pointerId, clientX: 90, clientY: 40, pointerType: "mouse" });
  fireEvent.pointerUp(canvas, { pointerId, clientX: 90, clientY: 40, pointerType: "mouse" });
}

describe("SignaturePad", () => {
  it("disables Save while the pad is empty", () => {
    render(<SignaturePad onSave={vi.fn()} />);
    expect(screen.getByRole("button", { name: /save signature/i })).toBeDisabled();
  });

  it("captures a pointer stroke (mouse/touch/stylus all use the same pointer events) and enables Save", () => {
    render(<SignaturePad onSave={vi.fn()} />);
    const canvas = screen.getByRole("img", { name: /signature canvas/i });

    drawStroke(canvas);

    expect(screen.getByRole("button", { name: /save signature/i })).not.toBeDisabled();
  });

  it("rejects saving an empty signature — onSave is never called without a stroke", () => {
    const onSave = vi.fn();
    render(<SignaturePad onSave={onSave} />);
    const saveButton = screen.getByRole("button", { name: /save signature/i });

    fireEvent.click(saveButton);

    expect(onSave).not.toHaveBeenCalled();
  });

  it("calls onSave with a PNG File once a stroke has been drawn and Save is clicked", () => {
    const onSave = vi.fn();
    render(<SignaturePad onSave={onSave} />);
    const canvas = screen.getByRole("img", { name: /signature canvas/i });

    drawStroke(canvas);
    fireEvent.click(screen.getByRole("button", { name: /save signature/i }));

    expect(onSave).toHaveBeenCalledTimes(1);
    const file = onSave.mock.calls[0]![0] as File;
    expect(file.type).toBe("image/png");
    expect(file.name).toBe("signature.png");
  });

  it("Clear empties the pad and disables Save again", () => {
    render(<SignaturePad onSave={vi.fn()} />);
    const canvas = screen.getByRole("img", { name: /signature canvas/i });

    drawStroke(canvas);
    expect(screen.getByRole("button", { name: /save signature/i })).not.toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: /clear/i }));

    expect(screen.getByRole("button", { name: /save signature/i })).toBeDisabled();
  });

  it("Undo removes the last stroke", () => {
    render(<SignaturePad onSave={vi.fn()} />);
    const canvas = screen.getByRole("img", { name: /signature canvas/i });
    const undoButton = screen.getByRole("button", { name: /undo/i });
    expect(undoButton).toBeDisabled();

    drawStroke(canvas, 1);
    expect(undoButton).not.toBeDisabled();

    fireEvent.click(undoButton);
    expect(undoButton).toBeDisabled();
    expect(screen.getByRole("button", { name: /save signature/i })).toBeDisabled();
  });

  it("calls onCancel when Cancel is clicked, without saving", () => {
    const onCancel = vi.fn();
    const onSave = vi.fn();
    render(<SignaturePad onSave={onSave} onCancel={onCancel} />);

    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("does not render a Cancel button when onCancel is not provided", () => {
    render(<SignaturePad onSave={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /^cancel$/i })).not.toBeInTheDocument();
  });

  it("shows a loading/saving state that disables every action", () => {
    render(<SignaturePad onSave={vi.fn()} onCancel={vi.fn()} isSaving />);

    expect(screen.getByRole("button", { name: /save signature/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /clear/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /undo/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^cancel$/i })).toBeDisabled();
  });

  it("shows the empty-state hint until a stroke is drawn", () => {
    render(<SignaturePad onSave={vi.fn()} />);
    expect(screen.getByText(/draw your signature above/i)).toBeInTheDocument();

    const canvas = screen.getByRole("img", { name: /signature canvas/i });
    drawStroke(canvas);

    expect(screen.queryByText(/draw your signature above/i)).not.toBeInTheDocument();
  });

  it("accepts custom (localized) labels", () => {
    render(
      <SignaturePad
        onSave={vi.fn()}
        labels={{
          clear: "Очистить",
          undo: "Шаг назад",
          save: "Сохранить подпись",
          cancel: "Отмена",
        }}
      />,
    );
    expect(screen.getByRole("button", { name: "Очистить" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Сохранить подпись" })).toBeInTheDocument();
  });

  it("is responsive — the canvas fills its container width rather than a fixed size", () => {
    const { container } = render(<SignaturePad onSave={vi.fn()} height={220} />);
    const canvas = container.querySelector("canvas")!;
    expect(canvas.style.width).toBe("300px");
    expect(canvas.style.height).toBe("220px");
  });
});
