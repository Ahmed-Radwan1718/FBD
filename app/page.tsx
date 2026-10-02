"use client";

import { useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

type ViewMode = "2D" | "3D";
type Shape = "Square" | "Rectangle" | "Circle" | "Triangle" | "Line";

type DrawnShape = {
  id: number;
  shape: Shape;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
};

type DraftShape = Omit<DrawnShape, "id">;

const shapes: Shape[] = ["Square", "Rectangle", "Circle", "Triangle", "Line"];

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className={`chevron ${open ? "is-open" : ""}`}
    >
      <path d="m5 7.5 5 5 5-5" />
    </svg>
  );
}

function ShapeIcon({ shape }: { shape: Shape }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.65,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="shape-icon">
      {shape === "Square" && <rect x="5" y="5" width="14" height="14" rx="1.5" {...common} />}
      {shape === "Rectangle" && <rect x="3.5" y="6.5" width="17" height="11" rx="1.5" {...common} />}
      {shape === "Circle" && <circle cx="12" cy="12" r="7.5" {...common} />}
      {shape === "Triangle" && <path d="M12 4.5 20 18H4Z" {...common} />}
      {shape === "Line" && <path d="M4.5 17.5 19.5 6.5" {...common} />}
    </svg>
  );
}

export default function Home() {
  const [mode, setMode] = useState<ViewMode>("2D");
  const [shapesOpen, setShapesOpen] = useState(true);
  const [selectedShape, setSelectedShape] = useState<Shape | null>(null);
  const [drawnShapes, setDrawnShapes] = useState<DrawnShape[]>([]);
  const [draftShape, setDraftShape] = useState<DraftShape | null>(null);

  function getCanvasPoint(event: ReactPointerEvent<HTMLElement>) {
    const rect = event.currentTarget.getBoundingClientRect();

    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLElement>) {
    if (!selectedShape) return;

    const point = getCanvasPoint(event);

    event.currentTarget.setPointerCapture(event.pointerId);

    setDraftShape({
      shape: selectedShape,
      startX: point.x,
      startY: point.y,
      endX: point.x,
      endY: point.y,
    });
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLElement>) {
    if (!draftShape) return;

    const point = getCanvasPoint(event);

    setDraftShape((current) =>
      current
        ? {
            ...current,
            endX: point.x,
            endY: point.y,
          }
        : null,
    );
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLElement>) {
    if (!draftShape) return;

    const point = getCanvasPoint(event);

    const finishedShape: DrawnShape = {
      ...draftShape,
      id: Date.now(),
      endX: point.x,
      endY: point.y,
    };

    const width = Math.abs(finishedShape.endX - finishedShape.startX);
    const height = Math.abs(finishedShape.endY - finishedShape.startY);

    if (width > 3 || height > 3) {
      setDrawnShapes((current) => [...current, finishedShape]);
    }

    setDraftShape(null);
  }

  function renderShape(shape: DrawnShape | DraftShape, key: string | number) {
    const dx = shape.endX - shape.startX;
    const dy = shape.endY - shape.startY;

    if (shape.shape === "Line") {
      return (
        <line
          key={key}
          x1={shape.startX}
          y1={shape.startY}
          x2={shape.endX}
          y2={shape.endY}
          className="canvas-shape"
        />
      );
    }

    if (shape.shape === "Square" || shape.shape === "Circle") {
      const size = Math.max(Math.abs(dx), Math.abs(dy));
      const width = dx < 0 ? -size : size;
      const height = dy < 0 ? -size : size;

      const x = width < 0 ? shape.startX + width : shape.startX;
      const y = height < 0 ? shape.startY + height : shape.startY;
      const absoluteSize = Math.abs(size);

      if (shape.shape === "Circle") {
        return (
          <ellipse
            key={key}
            cx={x + absoluteSize / 2}
            cy={y + absoluteSize / 2}
            rx={absoluteSize / 2}
            ry={absoluteSize / 2}
            className="canvas-shape"
          />
        );
      }

      return (
        <rect
          key={key}
          x={x}
          y={y}
          width={absoluteSize}
          height={absoluteSize}
          className="canvas-shape"
        />
      );
    }

    const x = Math.min(shape.startX, shape.endX);
    const y = Math.min(shape.startY, shape.endY);
    const width = Math.abs(dx);
    const height = Math.abs(dy);

    if (shape.shape === "Rectangle") {
      return (
        <rect
          key={key}
          x={x}
          y={y}
          width={width}
          height={height}
          className="canvas-shape"
        />
      );
    }

    return (
      <polygon
        key={key}
        points={`${x + width / 2},${y} ${x + width},${y + height} ${x},${y + height}`}
        className="canvas-shape"
      />
    );
  }

  return (
    <main className="editor-shell">
      <section
        className={`canvas ${selectedShape ? "has-active-tool" : ""}`}
        aria-label={`${mode} drawing canvas`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => setDraftShape(null)}
      >
        <div className="canvas-grid" />

        <svg className="drawing-layer" aria-hidden="true">
          {drawnShapes.map((shape) => renderShape(shape, shape.id))}
          {draftShape && (
            <g className="draft-shape">
              {renderShape(draftShape, "draft")}
            </g>
          )}
        </svg>

        <div className="canvas-origin" aria-hidden="true">
          <span className="axis-x" />
          <span className="axis-y" />
        </div>
      </section>

      <aside className="sidebar" aria-label="Drawing tools">
        <div className="brand-row">
          <div className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <span className="brand-name">FBD</span>
        </div>

        <div className="tool-section">
          <button
            className="section-trigger"
            type="button"
            aria-expanded={shapesOpen}
            onClick={() => setShapesOpen((value) => !value)}
          >
            <span>Shapes</span>
            <ChevronIcon open={shapesOpen} />
          </button>

          {shapesOpen && (
            <div className="shape-list">
              {shapes.map((shape) => {
                const active = selectedShape === shape;

                return (
                  <button
                    className={`shape-button ${active ? "is-active" : ""}`}
                    type="button"
                    key={shape}
                    aria-pressed={active}
                    onClick={() => setSelectedShape(active ? null : shape)}
                  >
                    <ShapeIcon shape={shape} />
                    <span>{shape}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </aside>

      <div className="mode-switch" aria-label="Canvas dimension">
        {(["2D", "3D"] as ViewMode[]).map((option) => (
          <button
            type="button"
            key={option}
            className={mode === option ? "is-active" : ""}
            aria-pressed={mode === option}
            onClick={() => setMode(option)}
          >
            {option}
          </button>
        ))}
        <span className={`mode-thumb ${mode === "3D" ? "is-3d" : ""}`} aria-hidden="true" />
      </div>
    </main>
  );
}
