"use client";

import * as React from "react";

import { Button } from "./button";
import { cn } from "../lib/utils";

interface Point {
  x: number;
  y: number;
  pressure: number;
}

type Stroke = Point[];

export interface SignaturePadLabels {
  clear?: string;
  undo?: string;
  save?: string;
  cancel?: string;
  /** Shown when the pad is empty and Save is disabled — a hint, not an error. */
  emptyHint?: string;
  /** Accessible name for the drawing canvas itself. */
  canvasLabel?: string;
}

export interface SignaturePadProps {
  /** Called with a PNG File once the user confirms a non-empty drawing. */
  onSave: (file: File) => void;
  onCancel?: (() => void) | undefined;
  /** Disables Save and shows a spinner-equivalent state while a parent's upload is in flight. */
  isSaving?: boolean | undefined;
  labels?: SignaturePadLabels | undefined;
  className?: string | undefined;
  /** Fixed pad height in CSS px — width always fills the container. */
  height?: number | undefined;
  /** "transparent" (default, composites cleanly into a document) or "white". */
  background?: "transparent" | "white" | undefined;
}

const DEFAULT_LABELS: Required<SignaturePadLabels> = {
  clear: "Clear",
  undo: "Undo",
  save: "Save signature",
  cancel: "Cancel",
  emptyHint: "Draw your signature above",
  canvasLabel: "Signature canvas",
};

/**
 * A reusable handwritten-signature capture canvas — Havelio Signature
 * System (docs/PRODUCT_BIBLE.md). Works uniformly across mouse, touch, and
 * stylus/Apple Pencil/Surface Pen via the Pointer Events API (one event
 * model instead of separate mouse/touch handlers). Strokes are kept as
 * point arrays (not just canvas pixels) so Undo can pop the last stroke
 * and redraw everything else from scratch, and so pressure (when the
 * device reports it) can vary the drawn line width for a more natural
 * mark. `touch-action: none` on the canvas stops the page from scrolling
 * while the user is actively drawing on a touchscreen.
 *
 * Output is a `File` (PNG, transparent by default) sized to the canvas's
 * actual drawn content at the device's real pixel ratio — never a fixed
 * huge canvas resolution regardless of the visible pad size.
 */
export function SignaturePad({
  onSave,
  onCancel,
  isSaving = false,
  labels,
  className,
  height = 180,
  background = "transparent",
}: SignaturePadProps) {
  const resolvedLabels = { ...DEFAULT_LABELS, ...labels };
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const strokesRef = React.useRef<Stroke[]>([]);
  const currentStrokeRef = React.useRef<Stroke | null>(null);
  const activePointerIdRef = React.useRef<number | null>(null);
  const [isEmpty, setIsEmpty] = React.useState(true);
  const [strokeCount, setStrokeCount] = React.useState(0);
  const [canvasSize, setCanvasSize] = React.useState({ width: 0, height });

  const redraw = React.useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvasSize.width, canvasSize.height);
    if (background === "white") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvasSize.width, canvasSize.height);
    }
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0f172a";
    for (const stroke of strokesRef.current) {
      if (stroke.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(stroke[0]!.x, stroke[0]!.y);
      for (let i = 1; i < stroke.length; i += 1) {
        const point = stroke[i]!;
        ctx.lineWidth = 1.5 + point.pressure * 2.5;
        ctx.lineTo(point.x, point.y);
      }
      ctx.stroke();
    }
    setIsEmpty(strokesRef.current.every((stroke) => stroke.length < 2));
    setStrokeCount(strokesRef.current.length);
  }, [background, canvasSize.width, canvasSize.height]);

  // Size the backing canvas to the container's actual CSS width at the
  // device's real pixel ratio — never a fixed resolution — and re-run on
  // resize so the pad stays sharp and correctly proportioned.
  React.useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    function applySize(width: number): void {
      const dpr = window.devicePixelRatio || 1;
      setCanvasSize({ width, height });
      canvas!.width = Math.max(1, Math.round(width * dpr));
      canvas!.height = Math.max(1, Math.round(height * dpr));
      canvas!.style.width = `${width}px`;
      canvas!.style.height = `${height}px`;
      redraw();
    }

    applySize(container.clientWidth);
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) applySize(entry.contentRect.width);
    });
    observer.observe(container);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- redraw is stable enough for this one-time-per-mount sizing effect; re-running on every redraw identity change would fight the ResizeObserver.
  }, [height]);

  function pointFromEvent(event: React.PointerEvent<HTMLCanvasElement>): Point {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      // Mouse reports pressure 0 even while pressed — treat that as a
      // normal, medium-weight stroke instead of an invisible hairline.
      pressure: event.pointerType === "mouse" ? 0.5 : (event.pressure ?? 0.5),
    };
  }

  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>): void {
    if (isSaving) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    activePointerIdRef.current = event.pointerId;
    const point = pointFromEvent(event);
    currentStrokeRef.current = [point];
    strokesRef.current = [...strokesRef.current, currentStrokeRef.current];
    redraw();
  }

  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>): void {
    if (activePointerIdRef.current !== event.pointerId || !currentStrokeRef.current) return;
    currentStrokeRef.current.push(pointFromEvent(event));
    redraw();
  }

  function endStroke(event: React.PointerEvent<HTMLCanvasElement>): void {
    if (activePointerIdRef.current !== event.pointerId) return;
    activePointerIdRef.current = null;
    currentStrokeRef.current = null;
  }

  function handleClear(): void {
    strokesRef.current = [];
    currentStrokeRef.current = null;
    redraw();
  }

  function handleUndo(): void {
    strokesRef.current = strokesRef.current.slice(0, -1);
    redraw();
  }

  function handleSave(): void {
    const canvas = canvasRef.current;
    if (!canvas || isEmpty || isSaving) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      onSave(new File([blob], "signature.png", { type: "image/png" }));
    }, "image/png");
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div
        ref={containerRef}
        className="border-input bg-muted/30 w-full overflow-hidden rounded-md border"
        style={{ height }}
      >
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={resolvedLabels.canvasLabel}
          className="block h-full w-full cursor-crosshair touch-none select-none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endStroke}
          onPointerLeave={endStroke}
          onPointerCancel={endStroke}
        />
      </div>
      {isEmpty && <p className="text-muted-foreground text-xs">{resolvedLabels.emptyHint}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleClear}
          disabled={isEmpty || isSaving}
        >
          {resolvedLabels.clear}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleUndo}
          disabled={strokeCount === 0 || isSaving}
        >
          {resolvedLabels.undo}
        </Button>
        <div className="flex-1" />
        {onCancel && (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={isSaving}>
            {resolvedLabels.cancel}
          </Button>
        )}
        <Button type="button" size="sm" onClick={handleSave} disabled={isEmpty || isSaving}>
          {resolvedLabels.save}
        </Button>
      </div>
    </div>
  );
}
