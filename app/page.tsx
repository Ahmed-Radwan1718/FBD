"use client";

import { useRef, useState } from "react";
import type {
  CSSProperties,
  PointerEvent as ReactPointerEvent,
  WheelEvent as ReactWheelEvent,
} from "react";

type ViewMode = "2D" | "3D";
type ScaleMode = "schematic" | "to-scale";
type Shape = "Square" | "Rectangle" | "Circle" | "Triangle" | "Line";

type ShapeMeasurements = {
  widthMeters: number;
  heightMeters: number;
  lengthMeters: number;
};

type DrawnShape = {
  id: number;
  shape: Shape;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  measurements: ShapeMeasurements;
};

type DraftShape = Omit<DrawnShape, "id" | "measurements">;

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
type MeasurementDimension = "width" | "height" | "length";

const PIXELS_PER_METER = 100;

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

const lengthUnits: { value: LengthUnit; label: string }[] = [
  { value: "km", label: "kilometers" },
  { value: "m", label: "meters" },
  { value: "cm", label: "centimeters" },
  { value: "mm", label: "millimeters" },
  { value: "µm", label: "micrometers" },
  { value: "nm", label: "nanometers" },
  { value: "in", label: "inches" },
  { value: "ft", label: "feet" },
];

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
  const [scaleMode, setScaleMode] = useState<ScaleMode>("schematic");
  const [shapesOpen, setShapesOpen] = useState(true);
  const [selectedShape, setSelectedShape] = useState<Shape | null>(null);
  const [selectedShapeId, setSelectedShapeId] = useState<number | null>(null);
  const [dimensionUnit, setDimensionUnit] = useState<LengthUnit>("cm");
  const [measurementDrafts, setMeasurementDrafts] = useState<
    Record<string, string>
  >({});
  const [drawnShapes, setDrawnShapes] = useState<DrawnShape[]>([]);
  const [draftShape, setDraftShape] = useState<DraftShape | null>(null);
  const [zoom, setZoom] = useState(1);
  const [viewportOffset, setViewportOffset] = useState({ x: 0, y: 0 });
  const canvasRef = useRef<HTMLElement | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const panStateRef = useRef<PanState | null>(null);
  const schematicViewRef = useRef({
    zoom: 1,
    viewportOffset: { x: 0, y: 0 },
  });

  const selectedDrawnShape =
    drawnShapes.find((shape) => shape.id === selectedShapeId) ?? null;

  const selectedDisplayShape = selectedDrawnShape
    ? getDisplayShape(selectedDrawnShape)
    : null;

  const selectedBounds = selectedDisplayShape
    ? getShapeBounds(selectedDisplayShape)
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
    const minZoom = scaleMode === "to-scale" ? 0.000001 : 0.25;
    const nextZoom = Math.min(8, Math.max(minZoom, zoom * zoomFactor));

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

  function getShapeBounds(shape: DrawnShape | DraftShape) {
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

  function metersToPixels(meters: number) {
    return meters * PIXELS_PER_METER;
  }

  function getToScaleShape(shape: DrawnShape): DrawnShape {
    const dx = shape.endX - shape.startX;
    const dy = shape.endY - shape.startY;

    if (shape.shape === "Line") {
      const currentLength = Math.hypot(dx, dy);
      const targetLength = metersToPixels(shape.measurements.lengthMeters);

      if (currentLength === 0) {
        return {
          ...shape,
          endX: shape.startX + targetLength,
          endY: shape.startY,
        };
      }

      const scale = targetLength / currentLength;

      return {
        ...shape,
        endX: shape.startX + dx * scale,
        endY: shape.startY + dy * scale,
      };
    }

    const xDirection = dx < 0 ? -1 : 1;
    const yDirection = dy < 0 ? -1 : 1;
    const width = metersToPixels(shape.measurements.widthMeters);
    const height = metersToPixels(shape.measurements.heightMeters);

    if (shape.shape === "Square" || shape.shape === "Circle") {
      const size = Math.max(width, height);

      return {
        ...shape,
        endX: shape.startX + xDirection * size,
        endY: shape.startY + yDirection * size,
      };
    }

    return {
      ...shape,
      endX: shape.startX + xDirection * width,
      endY: shape.startY + yDirection * height,
    };
  }

  function getDisplayShape(shape: DrawnShape) {
    return scaleMode === "to-scale" ? getToScaleShape(shape) : shape;
  }

  function fitToScaleView(shapes = drawnShapes) {
    const canvas = canvasRef.current;

    if (!canvas || shapes.length === 0) return;

    const bounds = shapes.map((shape) =>
      getShapeBounds(getToScaleShape(shape)),
    );

    const minX = Math.min(...bounds.map((bound) => bound.x));
    const minY = Math.min(...bounds.map((bound) => bound.y));
    const maxX = Math.max(
      ...bounds.map((bound) => bound.x + bound.width),
    );
    const maxY = Math.max(
      ...bounds.map((bound) => bound.y + bound.height),
    );

    const worldWidth = Math.max(maxX - minX, 1);
    const worldHeight = Math.max(maxY - minY, 1);

    const rect = canvas.getBoundingClientRect();
    const leftInset = rect.width <= 640 ? 246 : 286;
    const rightInset = 32;
    const topInset = 112;
    const bottomInset = 48;

    const availableWidth = Math.max(
      120,
      rect.width - leftInset - rightInset,
    );
    const availableHeight = Math.max(
      120,
      rect.height - topInset - bottomInset,
    );

    const nextZoom = Math.min(
      8,
      Math.max(
        0.000001,
        Math.min(
          availableWidth / worldWidth,
          availableHeight / worldHeight,
        ),
      ),
    );

    const screenCenterX = leftInset + availableWidth / 2;
    const screenCenterY = topInset + availableHeight / 2;
    const worldCenterX = (minX + maxX) / 2;
    const worldCenterY = (minY + maxY) / 2;

    setZoom(nextZoom);
    setViewportOffset({
      x: screenCenterX - worldCenterX * nextZoom,
      y: screenCenterY - worldCenterY * nextZoom,
    });
  }

  function handleScaleModeChange(nextMode: ScaleMode) {
    if (nextMode === scaleMode) return;

    setMeasurementDrafts({});

    if (nextMode === "to-scale") {
      schematicViewRef.current = {
        zoom,
        viewportOffset: { ...viewportOffset },
      };

      setScaleMode(nextMode);
      requestAnimationFrame(() => fitToScaleView(drawnShapes));
      return;
    }

    setScaleMode(nextMode);
    setZoom(schematicViewRef.current.zoom);
    setViewportOffset({
      ...schematicViewRef.current.viewportOffset,
    });
  }

  function formatDimensionValue(meters: number) {
    const value = meters / metersPerUnit[dimensionUnit];
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
    dimension: MeasurementDimension,
    rawValue: string,
  ) {
    const enteredValue = Number(rawValue);

    if (!Number.isFinite(enteredValue) || enteredValue <= 0) return;

    const enteredMeters = enteredValue * metersPerUnit[dimensionUnit];

    const nextShapes = drawnShapes.map((shape) => {
      if (shape.id !== id) return shape;

      if (shape.shape === "Line" && dimension === "length") {
        return {
          ...shape,
          measurements: {
            ...shape.measurements,
            lengthMeters: enteredMeters,
          },
        };
      }

      if (shape.shape === "Square" || shape.shape === "Circle") {
        return {
          ...shape,
          measurements: {
            ...shape.measurements,
            widthMeters: enteredMeters,
            heightMeters: enteredMeters,
          },
        };
      }

      return {
        ...shape,
        measurements: {
          ...shape.measurements,
          ...(dimension === "width"
            ? { widthMeters: enteredMeters }
            : {}),
          ...(dimension === "height"
            ? { heightMeters: enteredMeters }
            : {}),
        },
      };
    });

    setDrawnShapes(nextShapes);

    if (scaleMode === "to-scale") {
      requestAnimationFrame(() => fitToScaleView(nextShapes));
    }
  }

  function clearMeasurementDraft(key: string) {
    setMeasurementDrafts((current) => {
      if (!(key in current)) return current;

      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  function renderMeasurementEditor(
    shape: DrawnShape,
    dimension: MeasurementDimension,
    meters: number,
    className: string,
    style: CSSProperties,
    key: string,
  ) {
    const draftKey = `${shape.id}:${dimension}`;
    const value =
      measurementDrafts[draftKey] ?? formatDimensionValue(meters);

    return (
      <label
        key={key}
        className={`shape-measurement ${className} ${
          selectedShapeId === shape.id ? "is-selected" : ""
        }`}
        style={style}
        onPointerDown={(event) => {
          event.stopPropagation();
          setSelectedShape(null);
          setSelectedShapeId(shape.id);
        }}
        onWheel={(event) => event.stopPropagation()}
      >
        <input
          type="number"
          min="0"
          step="any"
          inputMode="decimal"
          aria-label={`Shape ${dimension}`}
          title="Press Enter to apply"
          value={value}
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) =>
            setMeasurementDrafts((current) => ({
              ...current,
              [draftKey]: event.target.value,
            }))
          }
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              updateShapeDimension(
                shape.id,
                dimension,
                event.currentTarget.value,
              );
              clearMeasurementDraft(draftKey);
              event.currentTarget.blur();
            } else if (event.key === "Escape") {
              event.preventDefault();
              clearMeasurementDraft(draftKey);
              event.currentTarget.blur();
            }
          }}
          onBlur={() => clearMeasurementDraft(draftKey)}
        />
        <span className="shape-measurement-separator" aria-hidden="true">
          ⋅
        </span>
        <select
          aria-label="Dimension unit"
          value={dimensionUnit}
          onChange={(event) => {
            setDimensionUnit(event.target.value as LengthUnit);
            setMeasurementDrafts({});
          }}
        >
          {lengthUnits.map((unit) => (
            <option key={unit.value} value={unit.value}>
              {unit.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  function renderShapeMeasurements(shape: DrawnShape) {
    const displayShape = getDisplayShape(shape);

    if (shape.shape === "Line") {
      return renderMeasurementEditor(
        shape,
        "length",
        shape.measurements.lengthMeters,
        "shape-measurement-line",
        {
          left:
            ((displayShape.startX + displayShape.endX) / 2) * zoom +
            viewportOffset.x,
          top:
            ((displayShape.startY + displayShape.endY) / 2) * zoom +
            viewportOffset.y +
            12,
        },
        `measurements-${shape.id}`,
      );
    }

    const bounds = getShapeBounds(displayShape);

    return (
      <div key={`measurements-${shape.id}`} className="shape-measurement-group">
        {renderMeasurementEditor(
          shape,
          "width",
          shape.measurements.widthMeters,
          "shape-measurement-horizontal",
          {
            left:
              (bounds.x + bounds.width / 2) * zoom +
              viewportOffset.x,
            top:
              (bounds.y + bounds.height) * zoom +
              viewportOffset.y +
              10,
          },
          `width-${shape.id}`,
        )}

        {renderMeasurementEditor(
          shape,
          "height",
          shape.measurements.heightMeters,
          "shape-measurement-vertical",
          {
            left:
              (bounds.x + bounds.width) * zoom +
              viewportOffset.x +
              10,
            top:
              (bounds.y + bounds.height / 2) * zoom +
              viewportOffset.y,
          },
          `height-${shape.id}`,
        )}
      </div>
    );
  }

  function deleteSelectedShape() {
    if (selectedShapeId === null) return;

    const nextShapes = drawnShapes.filter(
      (shape) => shape.id !== selectedShapeId,
    );

    setDrawnShapes(nextShapes);
    setMeasurementDrafts({});
    setSelectedShapeId(null);

    if (scaleMode === "to-scale") {
      if (nextShapes.length > 0) {
        requestAnimationFrame(() => fitToScaleView(nextShapes));
      } else {
        setZoom(1);
        setViewportOffset({ x: 0, y: 0 });
      }
    }
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

    const geometry: DraftShape = {
      ...draftShape,
      endX: point.x,
      endY: point.y,
    };

    const bounds = getShapeBounds(geometry);
    const lineLength = Math.hypot(
      geometry.endX - geometry.startX,
      geometry.endY - geometry.startY,
    );

    const finishedShape: DrawnShape = {
      ...geometry,
      id: Date.now(),
      measurements: {
        widthMeters: bounds.width / PIXELS_PER_METER,
        heightMeters: bounds.height / PIXELS_PER_METER,
        lengthMeters: lineLength / PIXELS_PER_METER,
      },
    };

    if (bounds.width > 3 || bounds.height > 3) {
      const nextShapes = [...drawnShapes, finishedShape];

      setDrawnShapes(nextShapes);

      if (scaleMode === "to-scale") {
        requestAnimationFrame(() => fitToScaleView(nextShapes));
      }
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
        ref={canvasRef}
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
              renderShape(getDisplayShape(shape), shape.id, true),
            )}

            {draftShape && (
              <g className="draft-shape">
                {renderShape(draftShape, "draft")}
              </g>
            )}
          </g>
        </svg>

        {mode === "2D" && drawnShapes.length > 0 && (
          <div className="shape-measurements-layer">
            {drawnShapes.map(renderShapeMeasurements)}
          </div>
        )}

        {selectedDrawnShape && selectedScreenBounds && (
          <div
            className="shape-controls-layer"
            onPointerDown={(event) => event.stopPropagation()}
            onWheel={(event) => event.stopPropagation()}
          >
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
        <span
          className={`mode-thumb ${mode === "3D" ? "is-3d" : ""}`}
          aria-hidden="true"
        />
      </div>

      <div className="scale-switch" aria-label="Drawing scale">
        {(["schematic", "to-scale"] as ScaleMode[]).map((option) => (
          <button
            type="button"
            key={option}
            className={scaleMode === option ? "is-active" : ""}
            aria-pressed={scaleMode === option}
            onClick={() => handleScaleModeChange(option)}
          >
            {option === "schematic" ? "Schematic" : "To scale"}
          </button>
        ))}
        <span
          className={`scale-thumb ${
            scaleMode === "to-scale" ? "is-to-scale" : ""
          }`}
          aria-hidden="true"
        />
      </div>

      <div
        className={`scale-status ${
          scaleMode === "to-scale" ? "is-to-scale" : ""
        }`}
      >
        {scaleMode === "schematic" ? "Not to scale" : "True proportions"}
      </div>
    </main>
  );
}
