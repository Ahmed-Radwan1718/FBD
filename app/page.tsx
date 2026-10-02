"use client";

import { useRef, useState } from "react";
import type {
  PointerEvent as ReactPointerEvent,
  WheelEvent as ReactWheelEvent,
} from "react";

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

type DragState = {
  id: number;
  pointerId: number;
  lastClientX: number;
  lastClientY: number;
};

type PanState = {
  pointerId: number;
  lastClientX: number;
  lastClientY: number;
};

type LengthUnit = "km" | "m" | "cm" | "mm" | "µm" | "nm" | "in" | "ft";

const PIXELS_PER_METER = 100;

const lengthUnits: { value: LengthUnit; label: string }[] = [
  { value: "km", label: "km" },
  { value: "m", label: "m" },
  { value: "cm", label: "cm" },
  { value: "mm", label: "mm" },
  { value: "µm", label: "µm" },
  { value: "nm", label: "nm" },
  { value: "in", label: "in" },
  { value: "ft", label: "ft" },
];

const metersPerUnit: Record<LengthUnit, number> = {
  km: 1000,
  m: 1,
  cm: 0.01,
  mm: 0.001,
  µm: 0.000001,
  nm: 0.000000001,
  in: 0.0254,
  ft: 0.3048,
};

const shapes: Shape[] = ["Rectangle", "Circle", "Triangle", "Line"];

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
  const [selectedShapeId, setSelectedShapeId] = useState<number | null>(null);
  const [dimensionUnit, setDimensionUnit] = useState<LengthUnit>("cm");
  const [drawnShapes, setDrawnShapes] = useState<DrawnShape[]>([]);
  const [draftShape, setDraftShape] = useState<DraftShape | null>(null);
  const [zoom, setZoom] = useState(1);
  const [viewportOffset, setViewportOffset] = useState({ x: 0, y: 0 });
  const dragStateRef = useRef<DragState | null>(null);
  const panStateRef = useRef<PanState | null>(null);

  const selectedDrawnShape =
    drawnShapes.find((shape) => shape.id === selectedShapeId) ?? null;

  const selectedDimensions = selectedDrawnShape
    ? getShapeDimensions(selectedDrawnShape)
    : null;

  const selectedBounds = selectedDrawnShape
    ? getShapeBounds(selectedDrawnShape)
    : null;

  const selectedScreenBounds = selectedBounds
    ? {
        x: selectedBounds.x * zoom + viewportOffset.x,
        y: selectedBounds.y * zoom + viewportOffset.y,
        width: selectedBounds.width * zoom,
        height: selectedBounds.height * zoom,
      }
    : null;

  function getCanvasPoint(event: ReactPointerEvent<HTMLElement>) {
    const rect = event.currentTarget.getBoundingClientRect();

    return {
      x: (event.clientX - rect.left - viewportOffset.x) / zoom,
      y: (event.clientY - rect.top - viewportOffset.y) / zoom,
    };
  }

  function handleWheel(event: ReactWheelEvent<HTMLElement>) {
    event.preventDefault();

    const rect = event.currentTarget.getBoundingClientRect();
    const cursorX = event.clientX - rect.left;
    const cursorY = event.clientY - rect.top;

    const zoomFactor = Math.exp(-event.deltaY * 0.0015);
    const nextZoom = Math.min(8, Math.max(0.25, zoom * zoomFactor));

    if (nextZoom === zoom) return;

    const worldX = (cursorX - viewportOffset.x) / zoom;
    const worldY = (cursorY - viewportOffset.y) / zoom;

    setViewportOffset({
      x: cursorX - worldX * nextZoom,
      y: cursorY - worldY * nextZoom,
    });

    setZoom(nextZoom);
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLElement>) {
    if (event.button !== 0) return;

    if (!selectedShape) {
      setSelectedShapeId(null);
      event.currentTarget.setPointerCapture(event.pointerId);

      panStateRef.current = {
        pointerId: event.pointerId,
        lastClientX: event.clientX,
        lastClientY: event.clientY,
      };

      return;
    }

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

  function handleShapePointerDown(
    event: ReactPointerEvent<SVGElement>,
    id: number,
  ) {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);

    setSelectedShape(null);
    setSelectedShapeId(id);

    dragStateRef.current = {
      id,
      pointerId: event.pointerId,
      lastClientX: event.clientX,
      lastClientY: event.clientY,
    };
  }

  function getShapeDimensions(shape: DrawnShape) {
    const width = Math.abs(shape.endX - shape.startX);
    const height = Math.abs(shape.endY - shape.startY);

    if (shape.shape === "Square" || shape.shape === "Circle") {
      const size = Math.max(width, height);

      return {
        width: size,
        height: size,
      };
    }

    return {
      width,
      height,
    };
  }

  function getShapeBounds(shape: DrawnShape) {
    const dx = shape.endX - shape.startX;
    const dy = shape.endY - shape.startY;

    if (shape.shape === "Square" || shape.shape === "Circle") {
      const size = Math.max(Math.abs(dx), Math.abs(dy));

      return {
        x: dx < 0 ? shape.startX - size : shape.startX,
        y: dy < 0 ? shape.startY - size : shape.startY,
        width: size,
        height: size,
      };
    }

    return {
      x: Math.min(shape.startX, shape.endX),
      y: Math.min(shape.startY, shape.endY),
      width: Math.abs(dx),
      height: Math.abs(dy),
    };
  }

  function pixelsToUnit(pixels: number, unit: LengthUnit) {
    const meters = pixels / PIXELS_PER_METER;
    return meters / metersPerUnit[unit];
  }

  function unitToPixels(value: number, unit: LengthUnit) {
    return value * metersPerUnit[unit] * PIXELS_PER_METER;
  }

  function formatDimensionValue(pixels: number) {
    const value = pixelsToUnit(pixels, dimensionUnit);
    const absoluteValue = Math.abs(value);

    let decimals = 3;

    if (absoluteValue >= 100) {
      decimals = 1;
    } else if (absoluteValue >= 10) {
      decimals = 2;
    } else if (absoluteValue < 1) {
      decimals = 6;
    }

    return value
      .toFixed(decimals)
      .replace(/\.0+$/, "")
      .replace(/(\.\d*?)0+$/, "$1");
  }

  function updateShapeDimension(
    id: number,
    dimension: "width" | "height",
    rawValue: string,
  ) {
    const enteredValue = Number(rawValue);

    if (!Number.isFinite(enteredValue) || enteredValue <= 0) return;

    const value = unitToPixels(enteredValue, dimensionUnit);

    setDrawnShapes((current) =>
      current.map((shape) => {
        if (shape.id !== id) return shape;

        const dx = shape.endX - shape.startX;
        const dy = shape.endY - shape.startY;
        const xDirection = dx < 0 ? -1 : 1;
        const yDirection = dy < 0 ? -1 : 1;

        if (shape.shape === "Square" || shape.shape === "Circle") {
          return {
            ...shape,
            endX: shape.startX + xDirection * value,
            endY: shape.startY + yDirection * value,
          };
        }

        return {
          ...shape,
          endX:
            dimension === "width"
              ? shape.startX + xDirection * value
              : shape.endX,
          endY:
            dimension === "height"
              ? shape.startY + yDirection * value
              : shape.endY,
        };
      }),
    );
  }

  function deleteSelectedShape() {
    if (selectedShapeId === null) return;

    setDrawnShapes((current) =>
      current.filter((shape) => shape.id !== selectedShapeId),
    );
    setSelectedShapeId(null);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLElement>) {
    const dragState = dragStateRef.current;

    if (dragState && dragState.pointerId === event.pointerId) {
      const deltaX = (event.clientX - dragState.lastClientX) / zoom;
      const deltaY = (event.clientY - dragState.lastClientY) / zoom;

      if (deltaX !== 0 || deltaY !== 0) {
        setDrawnShapes((current) =>
          current.map((shape) =>
            shape.id === dragState.id
              ? {
                  ...shape,
                  startX: shape.startX + deltaX,
                  startY: shape.startY + deltaY,
                  endX: shape.endX + deltaX,
                  endY: shape.endY + deltaY,
                }
              : shape,
          ),
        );

        dragStateRef.current = {
          ...dragState,
          lastClientX: event.clientX,
          lastClientY: event.clientY,
        };
      }

      return;
    }

    const panState = panStateRef.current;

    if (panState && panState.pointerId === event.pointerId) {
      const deltaX = event.clientX - panState.lastClientX;
      const deltaY = event.clientY - panState.lastClientY;

      if (deltaX !== 0 || deltaY !== 0) {
        setViewportOffset((current) => ({
          x: current.x + deltaX,
          y: current.y + deltaY,
        }));

        panStateRef.current = {
          pointerId: panState.pointerId,
          lastClientX: event.clientX,
          lastClientY: event.clientY,
        };
      }

      return;
    }

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
    if (dragStateRef.current?.pointerId === event.pointerId) {
      dragStateRef.current = null;
      return;
    }

    if (panStateRef.current?.pointerId === event.pointerId) {
      panStateRef.current = null;
      return;
    }

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

  function renderShape(
    shape: DrawnShape | DraftShape,
    key: string | number,
    selectable = false,
  ) {
    const dx = shape.endX - shape.startX;
    const dy = shape.endY - shape.startY;
    const isSelected = "id" in shape && selectedShapeId === shape.id;

    const shapeClassName = [
      "canvas-shape",
      selectable ? "saved-shape" : "",
      isSelected ? "is-selected" : "",
    ]
      .filter(Boolean)
      .join(" ");

    if (shape.shape === "Line") {
      return (
        <line
          key={key}
          x1={shape.startX}
          y1={shape.startY}
          x2={shape.endX}
          y2={shape.endY}
          className={shapeClassName}
          onPointerDown={
            selectable && "id" in shape
              ? (event) => handleShapePointerDown(event, shape.id)
              : undefined
          }
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
            className={shapeClassName}
            onPointerDown={
              selectable && "id" in shape
                ? (event) => handleShapePointerDown(event, shape.id)
                : undefined
            }
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
          className={shapeClassName}
          onPointerDown={
            selectable && "id" in shape
              ? (event) => handleShapePointerDown(event, shape.id)
              : undefined
          }
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
          className={shapeClassName}
          onPointerDown={
            selectable && "id" in shape
              ? (event) => handleShapePointerDown(event, shape.id)
              : undefined
          }
        />
      );
    }

    return (
      <polygon
        key={key}
        points={`${x + width / 2},${y} ${x + width},${y + height} ${x},${y + height}`}
        className={shapeClassName}
        onPointerDown={
          selectable && "id" in shape
            ? (event) => handleShapePointerDown(event, shape.id)
            : undefined
        }
      />
    );
  }

  return (
    <main className="editor-shell">
      <section
        className={`canvas ${selectedShape ? "has-active-tool" : ""}`}
        aria-label={`${mode} drawing canvas`}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => {
          dragStateRef.current = null;
          panStateRef.current = null;
          setDraftShape(null);
        }}
      >
        <div
          className="canvas-grid"
          style={{
            backgroundSize: `
              ${20 * zoom}px ${20 * zoom}px,
              ${20 * zoom}px ${20 * zoom}px,
              ${100 * zoom}px ${100 * zoom}px,
              ${100 * zoom}px ${100 * zoom}px
            `,
            backgroundPosition: `
              ${viewportOffset.x}px ${viewportOffset.y}px,
              ${viewportOffset.x}px ${viewportOffset.y}px,
              ${viewportOffset.x}px ${viewportOffset.y}px,
              ${viewportOffset.x}px ${viewportOffset.y}px
            `,
          }}
        />

        <svg className="drawing-layer">
          <g
            transform={`translate(${viewportOffset.x} ${viewportOffset.y}) scale(${zoom})`}
          >
            {drawnShapes.map((shape) =>
              renderShape(shape, shape.id, true),
            )}

            {draftShape && (
              <g className="draft-shape">
                {renderShape(draftShape, "draft")}
              </g>
            )}
          </g>
        </svg>

        {selectedDrawnShape &&
          selectedDimensions &&
          selectedScreenBounds && (
            <div
              className="shape-controls-layer"
              onPointerDown={(event) => event.stopPropagation()}
              onWheel={(event) => event.stopPropagation()}
            >
              <label
                className="shape-dimension-control shape-dimension-width"
                style={{
                  left:
                    selectedScreenBounds.x +
                    selectedScreenBounds.width / 2,
                  top: selectedScreenBounds.y,
                }}
              >
                <input
                  type="number"
                  min="0"
                  step="any"
                  aria-label="Shape width"
                  value={formatDimensionValue(selectedDimensions.width)}
                  onFocus={(event) => event.currentTarget.select()}
                  onChange={(event) =>
                    updateShapeDimension(
                      selectedDrawnShape.id,
                      "width",
                      event.target.value,
                    )
                  }
                />

                <span className="dimension-unit">
                  <select
                    aria-label="Dimension unit"
                    value={dimensionUnit}
                    onChange={(event) =>
                      setDimensionUnit(event.target.value as LengthUnit)
                    }
                  >
                    {lengthUnits.map((unit) => (
                      <option key={unit.value} value={unit.value}>
                        {unit.label}
                      </option>
                    ))}
                  </select>
                </span>
              </label>

              {selectedDrawnShape.shape !== "Square" &&
                selectedDrawnShape.shape !== "Circle" && (
                  <label
                    className="shape-dimension-control shape-dimension-height"
                    style={{
                      left:
                        selectedScreenBounds.x +
                        selectedScreenBounds.width,
                      top:
                        selectedScreenBounds.y +
                        selectedScreenBounds.height / 2,
                    }}
                  >
                    <input
                      type="number"
                      min="0"
                      step="any"
                      aria-label="Shape height"
                      value={formatDimensionValue(
                        selectedDimensions.height,
                      )}
                      onFocus={(event) => event.currentTarget.select()}
                      onChange={(event) =>
                        updateShapeDimension(
                          selectedDrawnShape.id,
                          "height",
                          event.target.value,
                        )
                      }
                    />

                    <span className="dimension-unit">
                      <select
                        aria-label="Dimension unit"
                        value={dimensionUnit}
                        onChange={(event) =>
                          setDimensionUnit(
                            event.target.value as LengthUnit,
                          )
                        }
                      >
                        {lengthUnits.map((unit) => (
                          <option key={unit.value} value={unit.value}>
                            {unit.label}
                          </option>
                        ))}
                      </select>
                    </span>
                  </label>
                )}

              <button
                className="shape-delete-control"
                type="button"
                aria-label="Delete shape"
                style={{
                  left:
                    selectedScreenBounds.x +
                    selectedScreenBounds.width,
                  top: selectedScreenBounds.y,
                }}
                onClick={deleteSelectedShape}
              >
                ×
              </button>
            </div>
          )}

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
                    onClick={() => {
                      setSelectedShape(active ? null : shape);
                      setSelectedShapeId(null);
                    }}
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
