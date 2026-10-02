"use client";

import { useEffect, useRef, useState } from "react";
import type {
  CSSProperties,
  PointerEvent as ReactPointerEvent,
  WheelEvent as ReactWheelEvent,
} from "react";

type ViewMode = "2D" | "3D";
type ScaleMode = "schematic" | "to-scale";
type Shape = "Square" | "Rectangle" | "Circle" | "Triangle" | "Line";
type ForceTool = "Applied Force" | "Weight" | "Normal" | "Friction" | "Tension";
type SupportTool = "Pin Support" | "Roller Support" | "Fixed Support";
type ConnectionTool = "Hinge" | "Cable" | "Spring";
type CanvasControl = "Grid" | "Snap to grid" | "Fit all" | "Reset view";
type SidebarTool = ForceTool | SupportTool | ConnectionTool | CanvasControl;

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

type OverlayGeometry = {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
};

type ForceItem = OverlayGeometry & {
  id: number;
  category: "force";
  kind: ForceTool;
  name: string;
  magnitude: number;
};

type SupportItem = OverlayGeometry & {
  id: number;
  category: "support";
  kind: SupportTool;
};

type ConnectionItem = OverlayGeometry & {
  id: number;
  category: "connection";
  kind: ConnectionTool;
};

type OverlayItem = ForceItem | SupportItem | ConnectionItem;

type DraftOverlay =
  | Omit<ForceItem, "id">
  | Omit<SupportItem, "id">
  | Omit<ConnectionItem, "id">;

type DragState = {
  id: number;
  target: "shape" | "force";
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

const forceTools: ForceTool[] = [
  "Applied Force",
  "Weight",
  "Normal",
  "Friction",
  "Tension",
];

const supportTools: SupportTool[] = [
  "Pin Support",
  "Roller Support",
  "Fixed Support",
];

const connectionTools: ConnectionTool[] = ["Hinge", "Cable", "Spring"];

const forceLabels: Record<ForceTool, string> = {
  "Applied Force": "F",
  Weight: "W",
  Normal: "N",
  Friction: "f",
  Tension: "T",
};

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

function ToolIcon({ tool }: { tool: SidebarTool }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.55,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="shape-icon">
      {tool === "Applied Force" && (
        <>
          <path d="M4 12h15" {...common} />
          <path d="m15 8 4 4-4 4" {...common} />
        </>
      )}
      {tool === "Weight" && (
        <>
          <path d="M12 4v15" {...common} />
          <path d="m8 15 4 4 4-4" {...common} />
        </>
      )}
      {tool === "Normal" && (
        <>
          <path d="M12 20V5" {...common} />
          <path d="m8 9 4-4 4 4" {...common} />
        </>
      )}
      {tool === "Friction" && (
        <>
          <path d="M20 12H5" {...common} />
          <path d="m9 8-4 4 4 4" {...common} />
        </>
      )}
      {tool === "Tension" && (
        <>
          <path d="M5 19 18 6" {...common} />
          <path d="m13 6h5v5" {...common} />
        </>
      )}
      {tool === "Pin Support" && (
        <>
          <path d="M12 5 5 17h14Z" {...common} />
          <path d="M3 20h18" {...common} />
        </>
      )}
      {tool === "Roller Support" && (
        <>
          <path d="M12 4 6 15h12Z" {...common} />
          <circle cx="8" cy="18" r="2" {...common} />
          <circle cx="16" cy="18" r="2" {...common} />
          <path d="M3 21h18" {...common} />
        </>
      )}
      {tool === "Fixed Support" && (
        <>
          <path d="M8 4v16" {...common} />
          <path d="m8 6-4 3m4 1-4 3m4 1-4 3m4 1-3 2" {...common} />
          <path d="M8 12h11" {...common} />
        </>
      )}
      {tool === "Hinge" && (
        <>
          <circle cx="12" cy="12" r="6.5" {...common} />
          <circle cx="12" cy="12" r="2" {...common} />
        </>
      )}
      {tool === "Cable" && <path d="M4 7c5 10 11 10 16 0" {...common} />}
      {tool === "Spring" && (
        <path d="M3 12h3l2-5 3 10 3-10 3 10 2-5h2" {...common} />
      )}
      {tool === "Grid" && (
        <>
          <path d="M4 4h16v16H4Z" {...common} />
          <path d="M9.3 4v16M14.7 4v16M4 9.3h16M4 14.7h16" {...common} />
        </>
      )}
      {tool === "Snap to grid" && (
        <>
          <path d="M5 5h5v5H5Zm9 9h5v5h-5Z" {...common} />
          <path d="M12 5v14M5 12h14" {...common} />
        </>
      )}
      {tool === "Fit all" && (
        <>
          <path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5" {...common} />
          <rect x="8" y="8" width="8" height="8" rx="1" {...common} />
        </>
      )}
      {tool === "Reset view" && (
        <>
          <path d="M6 8a7 7 0 1 1-1 7" {...common} />
          <path d="M6 4v4h4" {...common} />
        </>
      )}
    </svg>
  );
}

export default function Home() {
  const [mode, setMode] = useState<ViewMode>("2D");
  const [scaleMode, setScaleMode] = useState<ScaleMode>("schematic");

  const [shapesOpen, setShapesOpen] = useState(true);
  const [forcesOpen, setForcesOpen] = useState(false);
  const [supportsOpen, setSupportsOpen] = useState(false);
  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const [canvasControlsOpen, setCanvasControlsOpen] = useState(false);

  const [selectedShape, setSelectedShape] = useState<Shape | null>(null);
  const [selectedForceTool, setSelectedForceTool] = useState<ForceTool | null>(
    null,
  );
  const [selectedSupportTool, setSelectedSupportTool] =
    useState<SupportTool | null>(null);
  const [selectedConnectionTool, setSelectedConnectionTool] =
    useState<ConnectionTool | null>(null);

  const [selectedShapeId, setSelectedShapeId] = useState<number | null>(null);
  const [selectedForceId, setSelectedForceId] = useState<number | null>(null);
  const [dimensionUnit, setDimensionUnit] = useState<LengthUnit>("cm");
  const [activeMeasurement, setActiveMeasurement] = useState<string | null>(
    null,
  );
  const [measurementDrafts, setMeasurementDrafts] = useState<
    Record<string, string>
  >({});

  const [drawnShapes, setDrawnShapes] = useState<DrawnShape[]>([]);
  const [draftShape, setDraftShape] = useState<DraftShape | null>(null);
  const [overlayItems, setOverlayItems] = useState<OverlayItem[]>([]);
  const [draftOverlay, setDraftOverlay] = useState<DraftOverlay | null>(null);

  const [showGrid, setShowGrid] = useState(true);
  const [snapToGrid, setSnapToGrid] = useState(false);
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

  const selectedForceItem =
    (overlayItems.find(
      (item) =>
        item.category === "force" && item.id === selectedForceId,
    ) as ForceItem | undefined) ?? null;

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

  const hasActiveDrawingTool = Boolean(
    selectedShape ||
      selectedForceTool ||
      selectedSupportTool ||
      selectedConnectionTool,
  );

  function getCanvasPoint(event: ReactPointerEvent<HTMLElement>) {
    const rect = event.currentTarget.getBoundingClientRect();

    return {
      x: (event.clientX - rect.left - viewportOffset.x) / zoom,
      y: (event.clientY - rect.top - viewportOffset.y) / zoom,
    };
  }

  function getDrawingPoint(event: ReactPointerEvent<HTMLElement>) {
    const point = getCanvasPoint(event);

    if (!snapToGrid) return point;

    const spacing = 20;

    return {
      x: Math.round(point.x / spacing) * spacing,
      y: Math.round(point.y / spacing) * spacing,
    };
  }

  function clearDrawingTools() {
    setSelectedShape(null);
    setSelectedForceTool(null);
    setSelectedSupportTool(null);
    setSelectedConnectionTool(null);
  }

  function toggleShapeTool(shape: Shape) {
    const nextShape = selectedShape === shape ? null : shape;

    clearDrawingTools();
    setSelectedShape(nextShape);
    setSelectedShapeId(null);
    setSelectedForceId(null);
  }

  function toggleForceTool(tool: ForceTool) {
    const nextTool = selectedForceTool === tool ? null : tool;

    clearDrawingTools();
    setSelectedForceTool(nextTool);
    setSelectedShapeId(null);
    setSelectedForceId(null);
  }

  function toggleSupportTool(tool: SupportTool) {
    const nextTool = selectedSupportTool === tool ? null : tool;

    clearDrawingTools();
    setSelectedSupportTool(nextTool);
    setSelectedShapeId(null);
    setSelectedForceId(null);
  }

  function toggleConnectionTool(tool: ConnectionTool) {
    const nextTool = selectedConnectionTool === tool ? null : tool;

    clearDrawingTools();
    setSelectedConnectionTool(nextTool);
    setSelectedShapeId(null);
    setSelectedForceId(null);
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

    if (!hasActiveDrawingTool) {
      setSelectedShapeId(null);
      setSelectedForceId(null);
      event.currentTarget.setPointerCapture(event.pointerId);

      panStateRef.current = {
        pointerId: event.pointerId,
        lastClientX: event.clientX,
        lastClientY: event.clientY,
      };

      return;
    }

    const point = getDrawingPoint(event);

    event.currentTarget.setPointerCapture(event.pointerId);

    if (selectedShape) {
      setDraftShape({
        shape: selectedShape,
        startX: point.x,
        startY: point.y,
        endX: point.x,
        endY: point.y,
      });

      return;
    }

    if (selectedForceTool) {
      setDraftOverlay({
        category: "force",
        kind: selectedForceTool,
        name: forceLabels[selectedForceTool],
        magnitude: 100,
        startX: point.x,
        startY: point.y,
        endX: point.x,
        endY: point.y,
      });

      return;
    }

    if (selectedSupportTool) {
      setDraftOverlay({
        category: "support",
        kind: selectedSupportTool,
        startX: point.x,
        startY: point.y,
        endX: point.x,
        endY: point.y,
      });

      return;
    }

    if (selectedConnectionTool) {
      setDraftOverlay({
        category: "connection",
        kind: selectedConnectionTool,
        startX: point.x,
        startY: point.y,
        endX: point.x,
        endY: point.y,
      });
    }
  }

  function handleShapePointerDown(
    event: ReactPointerEvent<SVGElement>,
    id: number,
  ) {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);

    clearDrawingTools();
    setSelectedForceId(null);
    setSelectedShapeId(id);

    dragStateRef.current = {
      id,
      target: "shape",
      pointerId: event.pointerId,
      lastClientX: event.clientX,
      lastClientY: event.clientY,
    };
  }

  function handleForcePointerDown(
    event: ReactPointerEvent<SVGElement>,
    id: number,
  ) {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);

    clearDrawingTools();
    setSelectedShapeId(null);
    setSelectedForceId(id);

    dragStateRef.current = {
      id,
      target: "force",
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
    guideLength: number,
  ) {
    const draftKey = `${shape.id}:${dimension}`;
    const isEditing = activeMeasurement === draftKey;
    const value =
      measurementDrafts[draftKey] ?? formatDimensionValue(meters);

    const measurementStyle = {
      ...style,
      "--measurement-guide-length": `${guideLength}px`,
    } as CSSProperties;

    return (
      <div
        key={key}
        className={`shape-measurement ${className} ${
          selectedShapeId === shape.id ? "is-selected" : ""
        } ${isEditing ? "is-editing" : ""}`}
        style={measurementStyle}
        onPointerDown={(event) => {
          event.stopPropagation();
          clearDrawingTools();
          setSelectedForceId(null);
          setSelectedShapeId(shape.id);
        }}
        onWheel={(event) => event.stopPropagation()}
      >
        <span className="shape-measurement-guide" aria-hidden="true" />

        {isEditing ? (
          <label
            className="shape-measurement-editor"
            onBlur={(event) => {
              if (
                event.currentTarget.contains(
                  event.relatedTarget as Node | null,
                )
              ) {
                return;
              }

              clearMeasurementDraft(draftKey);
              setActiveMeasurement(null);
            }}
          >
            <input
              autoFocus
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
                  setActiveMeasurement(null);
                  event.currentTarget.blur();
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  clearMeasurementDraft(draftKey);
                  setActiveMeasurement(null);
                  event.currentTarget.blur();
                }
              }}
            />

            <span className="shape-measurement-separator" aria-hidden="true" />

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
                  {unit.value}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <button
            className="shape-measurement-display"
            type="button"
            title="Click to edit dimension"
            onClick={() => setActiveMeasurement(draftKey)}
          >
            <span>{formatDimensionValue(meters)}</span>
            <span className="shape-measurement-unit">
              {dimensionUnit}
            </span>
          </button>
        )}
      </div>
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
            16,
        },
        `measurements-${shape.id}`,
        0,
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
              24,
          },
          `width-${shape.id}`,
          bounds.width * zoom,
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
              24,
            top:
              (bounds.y + bounds.height / 2) * zoom +
              viewportOffset.y,
          },
          `height-${shape.id}`,
          bounds.height * zoom,
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
    setActiveMeasurement(null);
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

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const isDeleteKey =
        event.key === "Delete" ||
        event.key === "Backspace" ||
        event.code === "Delete" ||
        event.code === "Backspace";

      if (
        !isDeleteKey ||
        (selectedShapeId === null && selectedForceId === null)
      ) {
        return;
      }

      const target = event.target as HTMLElement | null;

      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.isContentEditable
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      if (selectedForceId !== null) {
        setOverlayItems((current) =>
          current.filter((item) => item.id !== selectedForceId),
        );
        setSelectedForceId(null);
        return;
      }

      if (selectedShapeId === null) return;

      const nextShapes = drawnShapes.filter(
        (shape) => shape.id !== selectedShapeId,
      );

      setDrawnShapes(nextShapes);
      setMeasurementDrafts({});
      setActiveMeasurement(null);
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

    document.addEventListener("keydown", handleKeyDown, true);

    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [
    drawnShapes,
    scaleMode,
    selectedForceId,
    selectedShapeId,
  ]);

  function getOverlayBounds(item: OverlayItem) {
    if (
      item.category === "support" ||
      (item.category === "connection" && item.kind === "Hinge")
    ) {
      return {
        x: item.startX - 24,
        y: item.startY - 24,
        width: 48,
        height: 52,
      };
    }

    const padding = 16;
    const minX = Math.min(item.startX, item.endX);
    const minY = Math.min(item.startY, item.endY);
    const maxX = Math.max(item.startX, item.endX);
    const maxY = Math.max(item.startY, item.endY);

    return {
      x: minX - padding,
      y: minY - padding,
      width: maxX - minX + padding * 2,
      height: maxY - minY + padding * 2,
    };
  }

  function fitAllView() {
    const canvas = canvasRef.current;

    if (!canvas) return;

    const bounds = [
      ...drawnShapes.map((shape) => getShapeBounds(getDisplayShape(shape))),
      ...overlayItems.map(getOverlayBounds),
    ];

    if (bounds.length === 0) {
      resetView();
      return;
    }

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
    const topInset = 72;
    const bottomInset = 48;

    const availableWidth = Math.max(
      120,
      rect.width - leftInset - rightInset,
    );
    const availableHeight = Math.max(
      120,
      rect.height - topInset - bottomInset,
    );

    const minimumZoom = scaleMode === "to-scale" ? 0.000001 : 0.02;
    const nextZoom = Math.min(
      8,
      Math.max(
        minimumZoom,
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

    const nextOffset = {
      x: screenCenterX - worldCenterX * nextZoom,
      y: screenCenterY - worldCenterY * nextZoom,
    };

    setZoom(nextZoom);
    setViewportOffset(nextOffset);

    if (scaleMode === "schematic") {
      schematicViewRef.current = {
        zoom: nextZoom,
        viewportOffset: nextOffset,
      };
    }
  }

  function resetView() {
    const nextOffset = { x: 0, y: 0 };

    setZoom(1);
    setViewportOffset(nextOffset);

    if (scaleMode === "schematic") {
      schematicViewRef.current = {
        zoom: 1,
        viewportOffset: nextOffset,
      };
    }
  }

  function getSpringPoints(item: OverlayGeometry) {
    const dx = item.endX - item.startX;
    const dy = item.endY - item.startY;
    const length = Math.hypot(dx, dy);

    if (length < 1) {
      return `${item.startX},${item.startY} ${item.endX},${item.endY}`;
    }

    const ux = dx / length;
    const uy = dy / length;
    const px = -uy;
    const py = ux;
    const segments = 10;
    const amplitude = 7;
    const points = [`${item.startX},${item.startY}`];

    for (let index = 1; index < segments; index += 1) {
      const progress = index / segments;
      const offset = index % 2 === 0 ? -amplitude : amplitude;

      points.push(
        `${item.startX + dx * progress + px * offset},${
          item.startY + dy * progress + py * offset
        }`,
      );
    }

    points.push(`${item.endX},${item.endY}`);

    return points.join(" ");
  }

  function getForceAngle(force: OverlayGeometry) {
    const deltaX = force.endX - force.startX;
    const deltaY = force.endY - force.startY;
    const degrees = Math.atan2(-deltaY, deltaX) * (180 / Math.PI);

    return (degrees + 360) % 360;
  }

  function updateForceName(id: number, name: string) {
    setOverlayItems((current) =>
      current.map((item) =>
        item.category === "force" && item.id === id
          ? { ...item, name }
          : item,
      ),
    );
  }

  function updateForceMagnitude(id: number, rawValue: string) {
    const magnitude = Number(rawValue);

    if (!Number.isFinite(magnitude) || magnitude < 0) return;

    setOverlayItems((current) =>
      current.map((item) =>
        item.category === "force" && item.id === id
          ? { ...item, magnitude }
          : item,
      ),
    );
  }

  function updateForceAngle(id: number, rawValue: string) {
    const enteredAngle = Number(rawValue);

    if (!Number.isFinite(enteredAngle)) return;

    const normalizedAngle =
      ((enteredAngle % 360) + 360) % 360;
    const radians = normalizedAngle * (Math.PI / 180);

    setOverlayItems((current) =>
      current.map((item) => {
        if (item.category !== "force" || item.id !== id) return item;

        const length = Math.max(
          1,
          Math.hypot(
            item.endX - item.startX,
            item.endY - item.startY,
          ),
        );

        return {
          ...item,
          endX: item.startX + Math.cos(radians) * length,
          endY: item.startY - Math.sin(radians) * length,
        };
      }),
    );
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLElement>) {
    const dragState = dragStateRef.current;

    if (dragState && dragState.pointerId === event.pointerId) {
      const deltaX = (event.clientX - dragState.lastClientX) / zoom;
      const deltaY = (event.clientY - dragState.lastClientY) / zoom;

      if (deltaX !== 0 || deltaY !== 0) {
        if (dragState.target === "shape") {
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
        } else {
          setOverlayItems((current) =>
            current.map((item) =>
              item.category === "force" && item.id === dragState.id
                ? {
                    ...item,
                    startX: item.startX + deltaX,
                    startY: item.startY + deltaY,
                    endX: item.endX + deltaX,
                    endY: item.endY + deltaY,
                  }
                : item,
            ),
          );
        }

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

    if (draftOverlay) {
      const isPointTool =
        draftOverlay.category === "support" ||
        (draftOverlay.category === "connection" &&
          draftOverlay.kind === "Hinge");

      if (isPointTool) return;

      const point = getDrawingPoint(event);

      setDraftOverlay((current) =>
        current
          ? {
              ...current,
              endX: point.x,
              endY: point.y,
            }
          : null,
      );

      return;
    }

    if (!draftShape) return;

    const point = getDrawingPoint(event);

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

    if (draftOverlay) {
      const point = getDrawingPoint(event);
      const isPointTool =
        draftOverlay.category === "support" ||
        (draftOverlay.category === "connection" &&
          draftOverlay.kind === "Hinge");

      const finishedOverlay = {
        ...draftOverlay,
        id: Date.now(),
        endX: isPointTool ? draftOverlay.startX : point.x,
        endY: isPointTool ? draftOverlay.startY : point.y,
      } as OverlayItem;

      const length = Math.hypot(
        finishedOverlay.endX - finishedOverlay.startX,
        finishedOverlay.endY - finishedOverlay.startY,
      );

      if (isPointTool || length > 3) {
        setOverlayItems((current) => [...current, finishedOverlay]);
      }

      setDraftOverlay(null);
      return;
    }

    if (!draftShape) return;

    const point = getDrawingPoint(event);

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

  function renderOverlayItem(
    item: OverlayItem | DraftOverlay,
    key: string | number,
    draft = false,
  ) {
    const isSelectedForce =
      !draft &&
      "id" in item &&
      item.category === "force" &&
      selectedForceId === item.id;

    const className = [
      "diagram-overlay",
      `diagram-overlay-${item.category}`,
      item.category === "connection" && item.kind === "Cable"
        ? "connection-cable"
        : "",
      !draft && item.category === "force" && "id" in item
        ? "is-selectable"
        : "",
      isSelectedForce ? "is-selected" : "",
      draft ? "is-draft" : "",
    ]
      .filter(Boolean)
      .join(" ");

    if (item.category === "force") {
      const midpointX = (item.startX + item.endX) / 2;
      const midpointY = (item.startY + item.endY) / 2;

      return (
        <g
          key={key}
          className={className}
          onPointerDown={
            !draft && "id" in item
              ? (event) => handleForcePointerDown(event, item.id)
              : undefined
          }
        >
          <line
            className="force-hit-target"
            x1={item.startX}
            y1={item.startY}
            x2={item.endX}
            y2={item.endY}
          />
          <line
            x1={item.startX}
            y1={item.startY}
            x2={item.endX}
            y2={item.endY}
            markerEnd="url(#force-arrowhead)"
          />

          {isSelectedForce && "id" in item && (
            <foreignObject
              className="force-inline-editor-object"
              x={midpointX - 103}
              y={midpointY - 48}
              width={206}
              height={36}
            >
              <div
                className="force-inline-editor"
                onPointerDown={(event) => event.stopPropagation()}
              >
                <input
                  className="force-inline-name"
                  type="text"
                  aria-label="Force name"
                  title="Force name"
                  value={item.name}
                  onFocus={(event) => event.currentTarget.select()}
                  onChange={(event) =>
                    updateForceName(item.id, event.currentTarget.value)
                  }
                />

                <span className="force-inline-separator" aria-hidden="true" />

                <label className="force-inline-value" title="Magnitude">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    aria-label="Force magnitude"
                    value={item.magnitude}
                    onFocus={(event) => event.currentTarget.select()}
                    onChange={(event) =>
                      updateForceMagnitude(item.id, event.currentTarget.value)
                    }
                  />
                  <span>N</span>
                </label>

                <span className="force-inline-separator" aria-hidden="true" />

                <label className="force-inline-value" title="Angle from +x">
                  <input
                    type="number"
                    step="any"
                    aria-label="Force angle"
                    value={Number(getForceAngle(item).toFixed(1))}
                    onFocus={(event) => event.currentTarget.select()}
                    onChange={(event) =>
                      updateForceAngle(item.id, event.currentTarget.value)
                    }
                  />
                  <span>°</span>
                </label>
              </div>
            </foreignObject>
          )}

          {!isSelectedForce && (
            <text x={midpointX + 8} y={midpointY - 8}>
              {item.name} = {item.magnitude} N
            </text>
          )}
        </g>
      );
    }

    if (item.category === "support") {
      const x = item.startX;
      const y = item.startY;

      if (item.kind === "Pin Support") {
        return (
          <g key={key} className={className}>
            <path
              className="support-body"
              d={`M ${x} ${y} L ${x - 15} ${y + 23} L ${x + 15} ${
                y + 23
              } Z`}
            />
            <line x1={x - 20} y1={y + 27} x2={x + 20} y2={y + 27} />
          </g>
        );
      }

      if (item.kind === "Roller Support") {
        return (
          <g key={key} className={className}>
            <path
              className="support-body"
              d={`M ${x} ${y} L ${x - 14} ${y + 20} L ${x + 14} ${
                y + 20
              } Z`}
            />
            <circle className="support-body" cx={x - 8} cy={y + 25} r="3" />
            <circle className="support-body" cx={x + 8} cy={y + 25} r="3" />
            <line x1={x - 20} y1={y + 30} x2={x + 20} y2={y + 30} />
          </g>
        );
      }

      return (
        <g key={key} className={className}>
          <line x1={x} y1={y - 22} x2={x} y2={y + 22} />
          <line x1={x} y1={y} x2={x + 24} y2={y} />
          {[-18, -9, 0, 9, 18].map((offset) => (
            <line
              key={offset}
              x1={x}
              y1={y + offset}
              x2={x - 9}
              y2={y + offset + 7}
            />
          ))}
        </g>
      );
    }

    if (item.kind === "Hinge") {
      return (
        <g key={key} className={className}>
          <circle className="support-body" cx={item.startX} cy={item.startY} r="9" />
          <circle cx={item.startX} cy={item.startY} r="3" />
        </g>
      );
    }

    if (item.kind === "Cable") {
      return (
        <g key={key} className={className}>
          <line
            x1={item.startX}
            y1={item.startY}
            x2={item.endX}
            y2={item.endY}
          />
        </g>
      );
    }

    return (
      <g key={key} className={className}>
        <polyline points={getSpringPoints(item)} />
      </g>
    );
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
        className={`canvas ${hasActiveDrawingTool ? "has-active-tool" : ""}`}
        aria-label={`${mode} drawing canvas`}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => {
          dragStateRef.current = null;
          panStateRef.current = null;
          setDraftShape(null);
          setDraftOverlay(null);
        }}
      >
        {showGrid && (
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
        )}

        <svg className="drawing-layer">
          <defs>
            <marker
              id="force-arrowhead"
              viewBox="0 0 8 8"
              refX="7"
              refY="4"
              markerWidth="7"
              markerHeight="7"
              orient="auto"
              markerUnits="strokeWidth"
            >
              <path d="M0 0 8 4 0 8Z" fill="#171717" />
            </marker>
          </defs>

          <g
            transform={`translate(${viewportOffset.x} ${viewportOffset.y}) scale(${zoom})`}
          >
            {drawnShapes.map((shape) =>
              renderShape(getDisplayShape(shape), shape.id, true),
            )}

            {overlayItems.map((item) =>
              renderOverlayItem(item, item.id),
            )}

            {draftShape && (
              <g className="draft-shape">
                {renderShape(draftShape, "draft")}
              </g>
            )}

            {draftOverlay &&
              renderOverlayItem(draftOverlay, "draft-overlay", true)}
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

      </section>

      <aside className="sidebar" aria-label="Drawing tools">
        <div className="brand-row">
          <div className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <span className="brand-name">Settings</span>
        </div>

        {/* Force properties are edited directly above the selected force. */}

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
                    onClick={() => toggleShapeTool(shape)}
                  >
                    <ShapeIcon shape={shape} />
                    <span>{shape}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="tool-section">
          <button
            className="section-trigger"
            type="button"
            aria-expanded={forcesOpen}
            onClick={() => setForcesOpen((value) => !value)}
          >
            <span>Forces</span>
            <ChevronIcon open={forcesOpen} />
          </button>

          {forcesOpen && (
            <div className="shape-list">
              {forceTools.map((tool) => {
                const active = selectedForceTool === tool;

                return (
                  <button
                    className={`shape-button ${active ? "is-active" : ""}`}
                    type="button"
                    key={tool}
                    aria-pressed={active}
                    onClick={() => toggleForceTool(tool)}
                  >
                    <ToolIcon tool={tool} />
                    <span>{tool}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="tool-section">
          <button
            className="section-trigger"
            type="button"
            aria-expanded={supportsOpen}
            onClick={() => setSupportsOpen((value) => !value)}
          >
            <span>Supports</span>
            <ChevronIcon open={supportsOpen} />
          </button>

          {supportsOpen && (
            <div className="shape-list">
              {supportTools.map((tool) => {
                const active = selectedSupportTool === tool;

                return (
                  <button
                    className={`shape-button ${active ? "is-active" : ""}`}
                    type="button"
                    key={tool}
                    aria-pressed={active}
                    onClick={() => toggleSupportTool(tool)}
                  >
                    <ToolIcon tool={tool} />
                    <span>{tool}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="tool-section">
          <button
            className="section-trigger"
            type="button"
            aria-expanded={connectionsOpen}
            onClick={() => setConnectionsOpen((value) => !value)}
          >
            <span>Connections</span>
            <ChevronIcon open={connectionsOpen} />
          </button>

          {connectionsOpen && (
            <div className="shape-list">
              {connectionTools.map((tool) => {
                const active = selectedConnectionTool === tool;

                return (
                  <button
                    className={`shape-button ${active ? "is-active" : ""}`}
                    type="button"
                    key={tool}
                    aria-pressed={active}
                    onClick={() => toggleConnectionTool(tool)}
                  >
                    <ToolIcon tool={tool} />
                    <span>{tool}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="tool-section">
          <button
            className="section-trigger"
            type="button"
            aria-expanded={canvasControlsOpen}
            onClick={() => setCanvasControlsOpen((value) => !value)}
          >
            <span>Canvas</span>
            <ChevronIcon open={canvasControlsOpen} />
          </button>

          {canvasControlsOpen && (
            <div className="shape-list">
              <button
                className={`shape-button ${showGrid ? "is-active" : ""}`}
                type="button"
                aria-pressed={showGrid}
                onClick={() => setShowGrid((value) => !value)}
              >
                <ToolIcon tool="Grid" />
                <span>Grid</span>
              </button>

              <button
                className={`shape-button ${snapToGrid ? "is-active" : ""}`}
                type="button"
                aria-pressed={snapToGrid}
                onClick={() => setSnapToGrid((value) => !value)}
              >
                <ToolIcon tool="Snap to grid" />
                <span>Snap to grid</span>
              </button>

              <button
                className="shape-button"
                type="button"
                onClick={fitAllView}
              >
                <ToolIcon tool="Fit all" />
                <span>Fit all</span>
              </button>

              <button
                className="shape-button"
                type="button"
                onClick={resetView}
              >
                <ToolIcon tool="Reset view" />
                <span>Reset view</span>
              </button>
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
