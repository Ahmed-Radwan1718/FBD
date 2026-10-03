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
type ForceTool = "Applied Force" | "Applied Load";
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
  shapeId?: number;
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
  target: "shape" | "force" | "support";
  pointerId: number;
  lastClientX: number;
  lastClientY: number;
  originClientX?: number;
  originClientY?: number;
  originStartX?: number;
  originStartY?: number;
  originEndX?: number;
  originEndY?: number;
  snappedSupportId?: number;
  snappedShapeId?: number;
};

type PanState = {
  pointerId: number;
  lastClientX: number;
  lastClientY: number;
};

type LengthUnit = "km" | "m" | "cm" | "mm" | "µm" | "nm" | "in" | "ft";
type MeasurementDimension = "width" | "height" | "length";

const PIXELS_PER_METER = 100;
const APPLIED_FORCE_LENGTH = 135;
const FORCE_SNAP_DISTANCE_PX = 14;
const FORCE_SNAP_RELEASE_PX = 28;
const MIDPOINT_SNAP_DISTANCE_PX = 22;
const SUPPORT_SNAP_DISTANCE_PX = 22;
const SUPPORT_SNAP_RELEASE_PX = 34;
const SUPPORT_CONTACT_EPSILON_PX = 3;

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

const forceTools: ForceTool[] = ["Applied Force", "Applied Load"];

const supportTools: SupportTool[] = [
  "Pin Support",
  "Roller Support",
  "Fixed Support",
];

const connectionTools: ConnectionTool[] = ["Hinge", "Cable", "Spring"];

const forceLabels: Record<ForceTool, string> = {
  "Applied Force": "F",
  "Applied Load": "w",
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
      {tool === "Applied Load" && (
        <>
          <path d="M4 6h16" {...common} />
          <path d="M6 6v11m0 0-2.5-3m2.5 3 2.5-3" {...common} />
          <path d="M12 6v11m0 0-2.5-3m2.5 3 2.5-3" {...common} />
          <path d="M18 6v11m0 0-2.5-3m2.5 3 2.5-3" {...common} />
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
  const [showForceMidpoints, setShowForceMidpoints] = useState(false);
  const [orthogonalForces, setOrthogonalForces] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [viewportOffset, setViewportOffset] = useState({ x: 0, y: 0 });

  const canvasRef = useRef<HTMLElement | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const panStateRef = useRef<PanState | null>(null);
  const draftForceOriginRef = useRef<{ x: number; y: number } | null>(null);
  const forceMidpointsActiveRef = useRef(false);
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
      if (selectedForceTool === "Applied Load") {
        return;
      }

      draftForceOriginRef.current = { x: point.x, y: point.y };
      forceMidpointsActiveRef.current = true;
      setShowForceMidpoints(true);
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

    const shape = drawnShapes.find((candidate) => candidate.id === id);

    if (!shape) return;

    if (selectedForceTool === "Applied Load") {
      const displayShape = getDisplayShape(shape);
      const bounds = getShapeBounds(displayShape);
      const anchorX =
        displayShape.shape === "Line"
          ? (displayShape.startX + displayShape.endX) / 2
          : bounds.x + bounds.width / 2;
      const anchorY =
        displayShape.shape === "Line"
          ? (displayShape.startY + displayShape.endY) / 2
          : bounds.y;
      const arrowLength = 36 / zoom;
      const loadId = Date.now();

      setOverlayItems((current) => [
        ...current,
        {
          id: loadId,
          category: "force",
          kind: "Applied Load",
          name: forceLabels["Applied Load"],
          magnitude: 100 / metersPerUnit[dimensionUnit],
          shapeId: id,
          startX: anchorX,
          startY: anchorY - arrowLength,
          endX: anchorX,
          endY: anchorY,
        },
      ]);
      setSelectedShapeId(null);
      setSelectedForceId(loadId);
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);

    clearDrawingTools();
    setSelectedForceId(null);
    setSelectedShapeId(id);

    const attachedSupport = getBestSupportSnap(
      shape,
      SUPPORT_CONTACT_EPSILON_PX / zoom,
    );

    dragStateRef.current = {
      id,
      target: "shape",
      pointerId: event.pointerId,
      lastClientX: event.clientX,
      lastClientY: event.clientY,
      originClientX: event.clientX,
      originClientY: event.clientY,
      originStartX: shape.startX,
      originStartY: shape.startY,
      originEndX: shape.endX,
      originEndY: shape.endY,
      snappedSupportId: attachedSupport?.support.id,
    };
  }

  function handleSupportPointerDown(
    event: ReactPointerEvent<SVGGElement>,
    id: number,
  ) {
    event.stopPropagation();

    const supportItem = overlayItems.find(
      (item) => item.category === "support" && item.id === id,
    );

    if (!supportItem || supportItem.category !== "support") return;

    clearDrawingTools();
    setSelectedShapeId(null);
    setSelectedForceId(null);
    event.currentTarget.setPointerCapture(event.pointerId);

    const attachedShape = getBestShapeSnapForSupport(
      supportItem,
      SUPPORT_CONTACT_EPSILON_PX / zoom,
    );

    dragStateRef.current = {
      id,
      target: "support",
      pointerId: event.pointerId,
      lastClientX: event.clientX,
      lastClientY: event.clientY,
      originClientX: event.clientX,
      originClientY: event.clientY,
      originStartX: supportItem.startX,
      originStartY: supportItem.startY,
      originEndX: supportItem.endX,
      originEndY: supportItem.endY,
      snappedShapeId: attachedShape?.shape.id,
    };
  }

  function handleForcePointerDown(
    event: ReactPointerEvent<SVGElement>,
    id: number,
  ) {
    event.stopPropagation();

    clearDrawingTools();
    setSelectedShapeId(null);
    setSelectedForceId(id);

    const forceItem = overlayItems.find(
      (item) => item.category === "force" && item.id === id,
    );

    if (!forceItem || forceItem.category !== "force") return;

    if (forceItem.kind === "Applied Load") {
      dragStateRef.current = null;
      return;
    }

    forceMidpointsActiveRef.current = true;
    setShowForceMidpoints(true);
    event.currentTarget.setPointerCapture(event.pointerId);

    dragStateRef.current = {
      id,
      target: "force",
      pointerId: event.pointerId,
      lastClientX: event.clientX,
      lastClientY: event.clientY,
      originClientX: event.clientX,
      originClientY: event.clientY,
      originStartX: forceItem.startX,
      originStartY: forceItem.startY,
      originEndX: forceItem.endX,
      originEndY: forceItem.endY,
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

  function getClosestPointOnSegment(
    point: { x: number; y: number },
    start: { x: number; y: number },
    end: { x: number; y: number },
  ) {
    const deltaX = end.x - start.x;
    const deltaY = end.y - start.y;
    const lengthSquared = deltaX * deltaX + deltaY * deltaY;

    if (lengthSquared === 0) return start;

    const progress = Math.max(
      0,
      Math.min(
        1,
        ((point.x - start.x) * deltaX +
          (point.y - start.y) * deltaY) /
          lengthSquared,
      ),
    );

    return {
      x: start.x + deltaX * progress,
      y: start.y + deltaY * progress,
    };
  }

  function getShapeMidpoints(shape: DrawnShape) {
    const bounds = getShapeBounds(shape);

    if (shape.shape === "Line") {
      return [
        {
          x: (shape.startX + shape.endX) / 2,
          y: (shape.startY + shape.endY) / 2,
        },
      ];
    }

    if (shape.shape === "Circle") {
      return [
        {
          x: bounds.x + bounds.width / 2,
          y: bounds.y + bounds.height / 2,
        },
      ];
    }

    if (shape.shape === "Triangle") {
      const top = {
        x: bounds.x + bounds.width / 2,
        y: bounds.y,
      };
      const bottomRight = {
        x: bounds.x + bounds.width,
        y: bounds.y + bounds.height,
      };
      const bottomLeft = {
        x: bounds.x,
        y: bounds.y + bounds.height,
      };

      return [
        {
          x: (top.x + bottomRight.x) / 2,
          y: (top.y + bottomRight.y) / 2,
        },
        {
          x: (bottomRight.x + bottomLeft.x) / 2,
          y: (bottomRight.y + bottomLeft.y) / 2,
        },
        {
          x: (bottomLeft.x + top.x) / 2,
          y: (bottomLeft.y + top.y) / 2,
        },
      ];
    }

    return [
      {
        x: bounds.x + bounds.width / 2,
        y: bounds.y,
      },
      {
        x: bounds.x + bounds.width,
        y: bounds.y + bounds.height / 2,
      },
      {
        x: bounds.x + bounds.width / 2,
        y: bounds.y + bounds.height,
      },
      {
        x: bounds.x,
        y: bounds.y + bounds.height / 2,
      },
    ];
  }

  function getShapeSnapPoint(
    shape: DrawnShape,
    point: { x: number; y: number },
  ) {
    const bounds = getShapeBounds(shape);

    if (shape.shape === "Circle") {
      const centerX = bounds.x + bounds.width / 2;
      const centerY = bounds.y + bounds.height / 2;
      const radius = Math.max(bounds.width / 2, 0.001);
      const deltaX = point.x - centerX;
      const deltaY = point.y - centerY;
      const distance = Math.hypot(deltaX, deltaY);

      if (distance < 0.001) {
        return { x: centerX, y: centerY - radius };
      }

      return {
        x: centerX + (deltaX / distance) * radius,
        y: centerY + (deltaY / distance) * radius,
      };
    }

    const segments =
      shape.shape === "Line"
        ? [
            [
              { x: shape.startX, y: shape.startY },
              { x: shape.endX, y: shape.endY },
            ],
          ]
        : shape.shape === "Triangle"
          ? [
              [
                { x: bounds.x + bounds.width / 2, y: bounds.y },
                { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
              ],
              [
                { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
                { x: bounds.x, y: bounds.y + bounds.height },
              ],
              [
                { x: bounds.x, y: bounds.y + bounds.height },
                { x: bounds.x + bounds.width / 2, y: bounds.y },
              ],
            ]
          : [
              [
                { x: bounds.x, y: bounds.y },
                { x: bounds.x + bounds.width, y: bounds.y },
              ],
              [
                { x: bounds.x + bounds.width, y: bounds.y },
                {
                  x: bounds.x + bounds.width,
                  y: bounds.y + bounds.height,
                },
              ],
              [
                {
                  x: bounds.x + bounds.width,
                  y: bounds.y + bounds.height,
                },
                { x: bounds.x, y: bounds.y + bounds.height },
              ],
              [
                { x: bounds.x, y: bounds.y + bounds.height },
                { x: bounds.x, y: bounds.y },
              ],
            ];

    let bestPoint = getClosestPointOnSegment(
      point,
      segments[0][0],
      segments[0][1],
    );
    let bestDistance = Math.hypot(
      point.x - bestPoint.x,
      point.y - bestPoint.y,
    );

    for (const [start, end] of segments.slice(1)) {
      const candidate = getClosestPointOnSegment(point, start, end);
      const distance = Math.hypot(
        point.x - candidate.x,
        point.y - candidate.y,
      );

      if (distance < bestDistance) {
        bestPoint = candidate;
        bestDistance = distance;
      }
    }

    return bestPoint;
  }

  function getSupportContactPoint(support: SupportItem) {
    if (support.kind === "Fixed Support") {
      return {
        x: support.startX + 24,
        y: support.startY,
      };
    }

    return {
      x: support.startX,
      y: support.startY,
    };
  }

  function getSupportSnapForShape(
    shape: DrawnShape,
    support: SupportItem,
    maxDistance: number,
  ) {
    const displayShape = getDisplayShape(shape);
    const bounds = getShapeBounds(displayShape);
    const supportPoint = getSupportContactPoint(support);
    const centerX = bounds.x + bounds.width / 2;

    const isOnSupportedSide =
      support.kind !== "Fixed Support" ||
      centerX >= supportPoint.x - maxDistance;

    if (!isOnSupportedSide) return null;

    const contactPoint = getShapeSnapPoint(displayShape, supportPoint);
    const distance = Math.hypot(
      supportPoint.x - contactPoint.x,
      supportPoint.y - contactPoint.y,
    );

    if (distance > maxDistance) return null;

    return {
      support,
      supportPoint,
      contactPoint,
      distance,
      offsetX: supportPoint.x - contactPoint.x,
      offsetY: supportPoint.y - contactPoint.y,
    };
  }

  function getBestSupportSnap(
    shape: DrawnShape,
    maxDistance: number,
  ) {
    let bestMatch:
      | ReturnType<typeof getSupportSnapForShape>
      | null = null;

    for (const item of overlayItems) {
      if (item.category !== "support") continue;

      const match = getSupportSnapForShape(shape, item, maxDistance);

      if (!match) continue;

      if (!bestMatch || match.distance < bestMatch.distance) {
        bestMatch = match;
      }
    }

    return bestMatch;
  }

  function getBestShapeSnapForSupport(
    support: SupportItem,
    maxDistance: number,
  ) {
    let bestMatch:
      | (NonNullable<ReturnType<typeof getSupportSnapForShape>> & {
          shape: DrawnShape;
        })
      | null = null;

    for (const shape of drawnShapes) {
      const match = getSupportSnapForShape(
        shape,
        support,
        maxDistance,
      );

      if (!match) continue;

      if (!bestMatch || match.distance < bestMatch.distance) {
        bestMatch = {
          ...match,
          shape,
        };
      }
    }

    return bestMatch;
  }

  function getSupportAttachment(support: SupportItem) {
    return getBestShapeSnapForSupport(
      support,
      SUPPORT_CONTACT_EPSILON_PX / zoom,
    );
  }

  function isSupportAttached(support: SupportItem) {
    return getSupportAttachment(support) !== null;
  }

  function getSupportRotationDegrees(support: SupportItem) {
    if (support.kind === "Fixed Support") return 0;

    const attachment = getSupportAttachment(support);

    if (!attachment) return 0;

    const displayShape = getDisplayShape(attachment.shape);
    const bounds = getShapeBounds(displayShape);
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;
    const contact = attachment.contactPoint;
    const deltaX = contact.x - centerX;
    const deltaY = contact.y - centerY;

    if (
      displayShape.shape === "Rectangle" ||
      displayShape.shape === "Square"
    ) {
      const normalizedDeltaX =
        Math.abs(deltaX) / Math.max(bounds.width / 2, 0.001);
      const normalizedDeltaY =
        Math.abs(deltaY) / Math.max(bounds.height / 2, 0.001);

      if (normalizedDeltaX > normalizedDeltaY) {
        return deltaX < 0 ? 90 : -90;
      }

      return deltaY < 0 ? 180 : 0;
    }

    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      return deltaX < 0 ? 90 : -90;
    }

    return deltaY < 0 ? 180 : 0;
  }

  function renderSupportReactions(support: SupportItem) {
    if (!isSupportAttached(support)) return null;

    const point = getSupportContactPoint(support);
    const reactionLength = 46 / zoom;

    if (support.kind === "Roller Support") {
      const rotation = getSupportRotationDegrees(support);
      const radians = rotation * (Math.PI / 180);
      const reactionEndX =
        point.x + Math.sin(radians) * reactionLength;
      const reactionEndY =
        point.y - Math.cos(radians) * reactionLength;

      return (
        <g className="support-reactions">
          <line
            className="support-reaction"
            x1={point.x}
            y1={point.y}
            x2={reactionEndX}
            y2={reactionEndY}
            markerEnd="url(#force-arrowhead)"
          />
          <text
            className="support-reaction-label"
            x={reactionEndX + 7 / zoom}
            y={reactionEndY - 7 / zoom}
          >
            R
          </text>
        </g>
      );
    }

    const horizontalReaction = (
      <>
        <line
          className="support-reaction"
          x1={point.x}
          y1={point.y}
          x2={point.x + reactionLength}
          y2={point.y}
          markerEnd="url(#force-arrowhead)"
        />
        <text
          className="support-reaction-label"
          x={point.x + reactionLength - 12 / zoom}
          y={point.y - 7 / zoom}
        >
          Rₓ
        </text>
      </>
    );

    const verticalReaction = (
      <>
        <line
          className="support-reaction"
          x1={point.x}
          y1={point.y}
          x2={point.x}
          y2={point.y - reactionLength}
          markerEnd="url(#force-arrowhead)"
        />
        <text
          className="support-reaction-label"
          x={point.x + 7 / zoom}
          y={point.y - reactionLength + 10 / zoom}
        >
          Rᵧ
        </text>
      </>
    );

    if (support.kind === "Fixed Support") {
      const radius = 18 / zoom;

      return (
        <g className="support-reactions">
          {horizontalReaction}
          {verticalReaction}
          <path
            className="support-reaction support-reaction-moment"
            d={`M ${point.x + radius} ${point.y + radius * 0.15}
              A ${radius} ${radius} 0 1 0
              ${point.x + radius * 0.15} ${point.y - radius}`}
            markerEnd="url(#force-arrowhead)"
          />
          <text
            className="support-reaction-label"
            x={point.x + radius + 5 / zoom}
            y={point.y + radius}
          >
            M
          </text>
        </g>
      );
    }

    return (
      <g className="support-reactions">
        {horizontalReaction}
        {verticalReaction}
      </g>
    );
  }

  function getPreferredShapeSnapCandidate(
    shape: DrawnShape,
    point: { x: number; y: number },
    midpointDistance: number,
  ) {
    if (forceMidpointsActiveRef.current) {
      let bestMidpoint:
        | {
            point: { x: number; y: number };
            distance: number;
          }
        | null = null;

      for (const midpoint of getShapeMidpoints(shape)) {
        const distance = Math.hypot(
          point.x - midpoint.x,
          point.y - midpoint.y,
        );

        if (!bestMidpoint || distance < bestMidpoint.distance) {
          bestMidpoint = { point: midpoint, distance };
        }
      }

      if (bestMidpoint && bestMidpoint.distance <= midpointDistance) {
        return {
          ...bestMidpoint,
          isMidpoint: true,
        };
      }
    }

    const snapPoint = getShapeSnapPoint(shape, point);

    return {
      point: snapPoint,
      distance: Math.hypot(
        point.x - snapPoint.x,
        point.y - snapPoint.y,
      ),
      isMidpoint: false,
    };
  }

  function normalizeAppliedForceLength(force: ForceItem) {
    if (force.kind !== "Applied Force") return force;

    const deltaX = force.endX - force.startX;
    const deltaY = force.endY - force.startY;
    const length = Math.hypot(deltaX, deltaY);

    if (length < 0.001) return force;

    const directionX = deltaX / length;
    const directionY = deltaY / length;

    return {
      ...force,
      endX: force.startX + directionX * APPLIED_FORCE_LENGTH,
      endY: force.startY + directionY * APPLIED_FORCE_LENGTH,
    };
  }

  function attachForceToShape(
    force: ForceItem,
    shapeId: number,
    snapPoint: { x: number; y: number },
  ) {
    const deltaX = force.endX - force.startX;
    const deltaY = force.endY - force.startY;
    const length = Math.max(0.001, Math.hypot(deltaX, deltaY));
    const directionX = deltaX / length;
    const directionY = deltaY / length;

    return {
      ...force,
      shapeId,
      startX: snapPoint.x - directionX * APPLIED_FORCE_LENGTH,
      startY: snapPoint.y - directionY * APPLIED_FORCE_LENGTH,
      endX: snapPoint.x,
      endY: snapPoint.y,
    };
  }

  function snapAppliedForceToShape(force: ForceItem) {
    if (force.kind !== "Applied Force") return force;

    const normalizedForce = normalizeAppliedForceLength(force);
    const forceDeltaX = normalizedForce.endX - normalizedForce.startX;
    const forceDeltaY = normalizedForce.endY - normalizedForce.startY;
    const forceLength = Math.max(
      0.001,
      Math.hypot(forceDeltaX, forceDeltaY),
    );
    const releaseDistance = FORCE_SNAP_RELEASE_PX / zoom;
    const acquireDistance = FORCE_SNAP_DISTANCE_PX / zoom;

    if (normalizedForce.shapeId !== undefined) {
      const attachedShape = drawnShapes.find(
        (shape) => shape.id === normalizedForce.shapeId,
      );

      if (attachedShape) {
        const snapCandidate = getPreferredShapeSnapCandidate(
          getDisplayShape(attachedShape),
          { x: normalizedForce.endX, y: normalizedForce.endY },
          releaseDistance,
        );

        if (snapCandidate.distance <= releaseDistance) {
          return attachForceToShape(
            normalizedForce,
            attachedShape.id,
            snapCandidate.point,
          );
        }
      }
    }

    const detachedForce = {
      ...normalizedForce,
      shapeId: undefined,
    };
    let bestMatch:
      | {
          shapeId: number;
          point: { x: number; y: number };
          distance: number;
        }
      | null = null;

    for (const shape of drawnShapes) {
      const snapCandidate = getPreferredShapeSnapCandidate(
        getDisplayShape(shape),
        { x: detachedForce.endX, y: detachedForce.endY },
        MIDPOINT_SNAP_DISTANCE_PX / zoom,
      );
      const snapLimit = snapCandidate.isMidpoint
        ? MIDPOINT_SNAP_DISTANCE_PX / zoom
        : acquireDistance;

      if (snapCandidate.distance > snapLimit) continue;

      const toShapeX = snapCandidate.point.x - detachedForce.startX;
      const toShapeY = snapCandidate.point.y - detachedForce.startY;
      const toShapeLength = Math.max(
        0.001,
        Math.hypot(toShapeX, toShapeY),
      );
      const alignment =
        (forceDeltaX * toShapeX + forceDeltaY * toShapeY) /
        (forceLength * toShapeLength);

      if (alignment < 0.72) continue;

      if (
        !bestMatch ||
        (snapCandidate.isMidpoint && snapCandidate.distance <= MIDPOINT_SNAP_DISTANCE_PX / zoom) ||
        snapCandidate.distance < bestMatch.distance
      ) {
        bestMatch = {
          shapeId: shape.id,
          point: snapCandidate.point,
          distance: snapCandidate.distance,
        };
      }
    }

    if (!bestMatch) return detachedForce;

    return attachForceToShape(
      detachedForce,
      bestMatch.shapeId,
      bestMatch.point,
    );
  }

  function getAppliedForcePointerPoint(
    origin: { x: number; y: number },
    point: { x: number; y: number },
  ) {
    if (!orthogonalForces) return point;

    const deltaX = point.x - origin.x;
    const deltaY = point.y - origin.y;

    return Math.abs(deltaX) >= Math.abs(deltaY)
      ? { x: point.x, y: origin.y }
      : { x: origin.x, y: point.y };
  }

  function buildAppliedForceDraftFromPointer(
    force: Omit<ForceItem, "id">,
    origin: { x: number; y: number },
    point: { x: number; y: number },
  ) {
    const constrainedPoint = getAppliedForcePointerPoint(origin, point);
    const deltaX = constrainedPoint.x - origin.x;
    const deltaY = constrainedPoint.y - origin.y;
    const length = Math.hypot(deltaX, deltaY);

    const rawForce: ForceItem = {
      ...force,
      id: -1,
      shapeId: undefined,
      startX: origin.x,
      startY: origin.y,
      endX: constrainedPoint.x,
      endY: constrainedPoint.y,
    };

    if (length < 0.001) return rawForce;

    const acquireDistance = FORCE_SNAP_DISTANCE_PX / zoom;
    let bestMatch:
      | {
          shapeId: number;
          point: { x: number; y: number };
          distance: number;
        }
      | null = null;

    for (const shape of drawnShapes) {
      const snapCandidate = getPreferredShapeSnapCandidate(
        getDisplayShape(shape),
        constrainedPoint,
        MIDPOINT_SNAP_DISTANCE_PX / zoom,
      );
      const snapLimit = snapCandidate.isMidpoint
        ? MIDPOINT_SNAP_DISTANCE_PX / zoom
        : acquireDistance;

      if (snapCandidate.distance > snapLimit) continue;

      const toShapeX = snapCandidate.point.x - origin.x;
      const toShapeY = snapCandidate.point.y - origin.y;
      const toShapeLength = Math.max(
        0.001,
        Math.hypot(toShapeX, toShapeY),
      );
      const alignment =
        (deltaX * toShapeX + deltaY * toShapeY) /
        (length * toShapeLength);

      if (alignment < 0.72) continue;

      if (
        !bestMatch ||
        (snapCandidate.isMidpoint && snapCandidate.distance <= MIDPOINT_SNAP_DISTANCE_PX / zoom) ||
        snapCandidate.distance < bestMatch.distance
      ) {
        bestMatch = {
          shapeId: shape.id,
          point: snapCandidate.point,
          distance: snapCandidate.distance,
        };
      }
    }

    if (!bestMatch) return rawForce;

    if (orthogonalForces) {
      const isHorizontal = Math.abs(deltaX) >= Math.abs(deltaY);
      const direction = isHorizontal
        ? Math.sign(deltaX) || 1
        : Math.sign(deltaY) || 1;

      return {
        ...rawForce,
        shapeId: bestMatch.shapeId,
        startX: isHorizontal
          ? bestMatch.point.x - direction * length
          : bestMatch.point.x,
        startY: isHorizontal
          ? bestMatch.point.y
          : bestMatch.point.y - direction * length,
        endX: bestMatch.point.x,
        endY: bestMatch.point.y,
      };
    }

    return {
      ...rawForce,
      shapeId: bestMatch.shapeId,
      endX: bestMatch.point.x,
      endY: bestMatch.point.y,
    };
  }

  function finalizeAppliedForceFromPointer(
    force: Omit<ForceItem, "id">,
    origin: { x: number; y: number },
    point: { x: number; y: number },
  ) {
    const draftForce = buildAppliedForceDraftFromPointer(
      force,
      origin,
      point,
    );

    if (draftForce.shapeId !== undefined) {
      return attachForceToShape(
        draftForce,
        draftForce.shapeId,
        { x: draftForce.endX, y: draftForce.endY },
      );
    }

    return normalizeAppliedForceLength(draftForce);
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

  function formatLoadMagnitude(newtonsPerMeter: number) {
    const value = newtonsPerMeter * metersPerUnit[dimensionUnit];
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

  function segmentsIntersect(
    firstStart: { x: number; y: number },
    firstEnd: { x: number; y: number },
    secondStart: { x: number; y: number },
    secondEnd: { x: number; y: number },
  ) {
    const firstDeltaX = firstEnd.x - firstStart.x;
    const firstDeltaY = firstEnd.y - firstStart.y;
    const secondDeltaX = secondEnd.x - secondStart.x;
    const secondDeltaY = secondEnd.y - secondStart.y;
    const denominator =
      firstDeltaX * secondDeltaY - firstDeltaY * secondDeltaX;

    if (Math.abs(denominator) < 0.000001) return false;

    const offsetX = secondStart.x - firstStart.x;
    const offsetY = secondStart.y - firstStart.y;
    const firstProgress =
      (offsetX * secondDeltaY - offsetY * secondDeltaX) / denominator;
    const secondProgress =
      (offsetX * firstDeltaY - offsetY * firstDeltaX) / denominator;

    return (
      firstProgress >= 0 &&
      firstProgress <= 1 &&
      secondProgress >= 0 &&
      secondProgress <= 1
    );
  }

  function pointToSegmentDistance(
    point: { x: number; y: number },
    start: { x: number; y: number },
    end: { x: number; y: number },
  ) {
    const closest = getClosestPointOnSegment(point, start, end);
    return Math.hypot(point.x - closest.x, point.y - closest.y);
  }

  function appliedForceOverlapsMeasurement(
    labelCenter: { x: number; y: number },
    guideStart: { x: number; y: number },
    guideEnd: { x: number; y: number },
  ) {
    return overlayItems.some((item) => {
      if (
        item.category !== "force" ||
        item.kind !== "Applied Force"
      ) {
        return false;
      }

      const forceStart = {
        x: item.startX * zoom + viewportOffset.x,
        y: item.startY * zoom + viewportOffset.y,
      };
      const forceEnd = {
        x: item.endX * zoom + viewportOffset.x,
        y: item.endY * zoom + viewportOffset.y,
      };

      return (
        segmentsIntersect(forceStart, forceEnd, guideStart, guideEnd) ||
        pointToSegmentDistance(labelCenter, forceStart, forceEnd) <= 20
      );
    });
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
    const screenLeft = bounds.x * zoom + viewportOffset.x;
    const screenTop = bounds.y * zoom + viewportOffset.y;
    const screenWidth = bounds.width * zoom;
    const screenHeight = bounds.height * zoom;
    const screenRight = screenLeft + screenWidth;
    const screenBottom = screenTop + screenHeight;
    const screenCenterX = screenLeft + screenWidth / 2;
    const screenCenterY = screenTop + screenHeight / 2;

    const widthOutsideY = screenBottom + 24;
    const widthInsideOffset = Math.min(
      24,
      Math.max(12, screenHeight / 3),
    );
    const widthOverlapsForce = appliedForceOverlapsMeasurement(
      { x: screenCenterX, y: widthOutsideY },
      { x: screenLeft, y: widthOutsideY },
      { x: screenRight, y: widthOutsideY },
    );
    const widthY = widthOverlapsForce
      ? screenBottom - widthInsideOffset
      : widthOutsideY;

    const heightOutsideX = screenRight + 24;
    const heightInsideOffset = Math.min(
      24,
      Math.max(12, screenWidth / 3),
    );
    const heightOverlapsForce = appliedForceOverlapsMeasurement(
      { x: heightOutsideX, y: screenCenterY },
      { x: heightOutsideX, y: screenTop },
      { x: heightOutsideX, y: screenBottom },
    );
    const heightX = heightOverlapsForce
      ? screenRight - heightInsideOffset
      : heightOutsideX;

    return (
      <div key={`measurements-${shape.id}`} className="shape-measurement-group">
        {renderMeasurementEditor(
          shape,
          "width",
          shape.measurements.widthMeters,
          "shape-measurement-horizontal",
          {
            left: screenCenterX,
            top: widthY,
          },
          `width-${shape.id}`,
          screenWidth,
        )}

        {renderMeasurementEditor(
          shape,
          "height",
          shape.measurements.heightMeters,
          "shape-measurement-vertical",
          {
            left: heightX,
            top: screenCenterY,
          },
          `height-${shape.id}`,
          screenHeight,
        )}
      </div>
    );
  }

  function deleteSelectedShape() {
    if (selectedShapeId === null) return;

    const deletedShapeId = selectedShapeId;
    const nextShapes = drawnShapes.filter(
      (shape) => shape.id !== deletedShapeId,
    );

    setDrawnShapes(nextShapes);
    setOverlayItems((current) =>
      current.filter(
        (item) =>
          !(
            item.category === "force" &&
            item.shapeId === deletedShapeId
          ),
      ),
    );
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

      const deletedShapeId = selectedShapeId;
      const nextShapes = drawnShapes.filter(
        (shape) => shape.id !== deletedShapeId,
      );

      setDrawnShapes(nextShapes);
      setOverlayItems((current) =>
        current.filter(
          (item) =>
            !(
              item.category === "force" &&
              item.shapeId === deletedShapeId
            ),
        ),
      );
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
          ? {
              ...item,
              magnitude:
                item.kind === "Applied Load"
                  ? magnitude / metersPerUnit[dimensionUnit]
                  : magnitude,
            }
          : item,
      ),
    );
  }

  function updateForceAngle(id: number, rawValue: string) {
    const enteredAngle = Number(rawValue);

    if (!Number.isFinite(enteredAngle)) return;

    const normalizedAngle =
      ((enteredAngle % 360) + 360) % 360;

    setOverlayItems((current) =>
      current.map((item) => {
        if (item.category !== "force" || item.id !== id) return item;

        const appliedAngle =
          item.kind === "Applied Force" && orthogonalForces
            ? (Math.round(normalizedAngle / 90) * 90) % 360
            : normalizedAngle;
        const radians = appliedAngle * (Math.PI / 180);
        const length =
          item.kind === "Applied Force"
            ? APPLIED_FORCE_LENGTH
            : Math.max(
                1,
                Math.hypot(
                  item.endX - item.startX,
                  item.endY - item.startY,
                ),
              );

        const rotatedForce = {
          ...item,
          endX: item.startX + Math.cos(radians) * length,
          endY: item.startY - Math.sin(radians) * length,
        };

        return item.kind === "Applied Force"
          ? snapAppliedForceToShape(rotatedForce)
          : rotatedForce;
      }),
    );
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLElement>) {
    const dragState = dragStateRef.current;

    if (dragState && dragState.pointerId === event.pointerId) {
      if (
        dragState.target === "force" &&
        dragState.originClientX !== undefined &&
        dragState.originClientY !== undefined &&
        dragState.originStartX !== undefined &&
        dragState.originStartY !== undefined &&
        dragState.originEndX !== undefined &&
        dragState.originEndY !== undefined
      ) {
        const totalDeltaX =
          (event.clientX - dragState.originClientX) / zoom;
        const totalDeltaY =
          (event.clientY - dragState.originClientY) / zoom;

        setOverlayItems((current) =>
          current.map((item) => {
            if (item.category !== "force" || item.id !== dragState.id) {
              return item;
            }

            const movedForce = {
              ...item,
              startX: dragState.originStartX! + totalDeltaX,
              startY: dragState.originStartY! + totalDeltaY,
              endX: dragState.originEndX! + totalDeltaX,
              endY: dragState.originEndY! + totalDeltaY,
            };

            return item.kind === "Applied Force"
              ? snapAppliedForceToShape(movedForce)
              : movedForce;
          }),
        );

        return;
      }

      if (
        dragState.target === "support" &&
        dragState.originClientX !== undefined &&
        dragState.originClientY !== undefined &&
        dragState.originStartX !== undefined &&
        dragState.originStartY !== undefined &&
        dragState.originEndX !== undefined &&
        dragState.originEndY !== undefined
      ) {
        const currentSupport = overlayItems.find(
          (item) =>
            item.category === "support" && item.id === dragState.id,
        );

        if (!currentSupport || currentSupport.category !== "support") {
          return;
        }

        const totalDeltaX =
          (event.clientX - dragState.originClientX) / zoom;
        const totalDeltaY =
          (event.clientY - dragState.originClientY) / zoom;
        const proposedSupport: SupportItem = {
          ...currentSupport,
          startX: dragState.originStartX + totalDeltaX,
          startY: dragState.originStartY + totalDeltaY,
          endX: dragState.originEndX + totalDeltaX,
          endY: dragState.originEndY + totalDeltaY,
        };
        const shapeSnap = getBestShapeSnapForSupport(
          proposedSupport,
          SUPPORT_SNAP_DISTANCE_PX / zoom,
        );

        const nextSupport = shapeSnap
          ? {
              ...proposedSupport,
              startX: proposedSupport.startX - shapeSnap.offsetX,
              startY: proposedSupport.startY - shapeSnap.offsetY,
              endX: proposedSupport.endX - shapeSnap.offsetX,
              endY: proposedSupport.endY - shapeSnap.offsetY,
            }
          : proposedSupport;

        dragStateRef.current = {
          ...dragState,
          lastClientX: event.clientX,
          lastClientY: event.clientY,
          snappedShapeId: shapeSnap?.shape.id,
        };

        if (
          nextSupport.startX !== currentSupport.startX ||
          nextSupport.startY !== currentSupport.startY
        ) {
          setOverlayItems((current) =>
            current.map((item) =>
              item.category === "support" && item.id === dragState.id
                ? nextSupport
                : item,
            ),
          );
        }

        return;
      }

      if (
        dragState.target === "shape" &&
        dragState.originClientX !== undefined &&
        dragState.originClientY !== undefined &&
        dragState.originStartX !== undefined &&
        dragState.originStartY !== undefined &&
        dragState.originEndX !== undefined &&
        dragState.originEndY !== undefined
      ) {
        const currentShape = drawnShapes.find(
          (shape) => shape.id === dragState.id,
        );

        if (!currentShape) return;

        const totalDeltaX =
          (event.clientX - dragState.originClientX) / zoom;
        const totalDeltaY =
          (event.clientY - dragState.originClientY) / zoom;
        const pointerTravel = Math.hypot(
          event.clientX - dragState.originClientX,
          event.clientY - dragState.originClientY,
        );

        let nextShape: DrawnShape;

        if (
          dragState.snappedSupportId !== undefined &&
          pointerTravel < SUPPORT_SNAP_RELEASE_PX
        ) {
          nextShape = {
            ...currentShape,
          };
        } else {
          const proposedShape: DrawnShape = {
            ...currentShape,
            startX: dragState.originStartX + totalDeltaX,
            startY: dragState.originStartY + totalDeltaY,
            endX: dragState.originEndX + totalDeltaX,
            endY: dragState.originEndY + totalDeltaY,
          };
          const supportSnap = getBestSupportSnap(
            proposedShape,
            SUPPORT_SNAP_DISTANCE_PX / zoom,
          );

          if (supportSnap) {
            nextShape = {
              ...proposedShape,
              startX: proposedShape.startX + supportSnap.offsetX,
              startY: proposedShape.startY + supportSnap.offsetY,
              endX: proposedShape.endX + supportSnap.offsetX,
              endY: proposedShape.endY + supportSnap.offsetY,
            };

            dragStateRef.current = {
              ...dragState,
              lastClientX: event.clientX,
              lastClientY: event.clientY,
              originClientX: event.clientX,
              originClientY: event.clientY,
              originStartX: nextShape.startX,
              originStartY: nextShape.startY,
              originEndX: nextShape.endX,
              originEndY: nextShape.endY,
              snappedSupportId: supportSnap.support.id,
            };
          } else {
            nextShape = proposedShape;

            if (dragState.snappedSupportId !== undefined) {
              dragStateRef.current = {
                ...dragState,
                snappedSupportId: undefined,
              };
            }
          }
        }

        const actualDeltaX = nextShape.startX - currentShape.startX;
        const actualDeltaY = nextShape.startY - currentShape.startY;

        if (actualDeltaX !== 0 || actualDeltaY !== 0) {
          setDrawnShapes((current) =>
            current.map((shape) =>
              shape.id === dragState.id ? nextShape : shape,
            ),
          );

          setOverlayItems((current) =>
            current.map((item) =>
              item.category === "force" &&
              item.shapeId === dragState.id
                ? {
                    ...item,
                    startX: item.startX + actualDeltaX,
                    startY: item.startY + actualDeltaY,
                    endX: item.endX + actualDeltaX,
                    endY: item.endY + actualDeltaY,
                  }
                : item,
            ),
          );
        }

        return;
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

      setDraftOverlay((current) => {
        if (!current) return null;

        if (
          current.category !== "force" ||
          current.kind !== "Applied Force"
        ) {
          return {
            ...current,
            endX: point.x,
            endY: point.y,
          };
        }

        const origin = draftForceOriginRef.current ?? {
          x: current.startX,
          y: current.startY,
        };
        const pointerDistance = Math.hypot(
          point.x - origin.x,
          point.y - origin.y,
        );

        if (pointerDistance < 1 / zoom) return current;

        const previewForce = buildAppliedForceDraftFromPointer(
          current,
          origin,
          point,
        );
        const { id: _temporaryId, ...previewDraft } = previewForce;

        return previewDraft;
      });

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
      forceMidpointsActiveRef.current = false;
      setShowForceMidpoints(false);
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

      let overlayToAdd: OverlayItem | null = null;

      if (
        draftOverlay.category === "force" &&
        draftOverlay.kind === "Applied Force"
      ) {
        const origin = draftForceOriginRef.current ?? {
          x: draftOverlay.startX,
          y: draftOverlay.startY,
        };
        const drawDistance = Math.hypot(
          point.x - origin.x,
          point.y - origin.y,
        );

        if (drawDistance > 3 / zoom) {
          overlayToAdd = {
            ...finalizeAppliedForceFromPointer(
              draftOverlay,
              origin,
              point,
            ),
            id: Date.now(),
          };
        }
      } else {
        overlayToAdd = {
          ...draftOverlay,
          id: Date.now(),
          endX: isPointTool ? draftOverlay.startX : point.x,
          endY: isPointTool ? draftOverlay.startY : point.y,
        } as OverlayItem;
      }

      if (overlayToAdd) {
        const length = Math.hypot(
          overlayToAdd.endX - overlayToAdd.startX,
          overlayToAdd.endY - overlayToAdd.startY,
        );

        if (isPointTool || length > 3) {
          setOverlayItems((current) => [...current, overlayToAdd]);
        }
      }

      draftForceOriginRef.current = null;
      forceMidpointsActiveRef.current = false;
      setShowForceMidpoints(false);
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
      !draft &&
      "id" in item &&
      (item.category === "force" || item.category === "support")
        ? "is-selectable"
        : "",
      isSelectedForce ? "is-selected" : "",
      draft ? "is-draft" : "",
    ]
      .filter(Boolean)
      .join(" ");

    if (item.category === "force" && item.kind === "Applied Load") {
      const targetShape =
        item.shapeId === undefined
          ? null
          : drawnShapes.find((shape) => shape.id === item.shapeId) ?? null;

      if (!targetShape) return null;

      const displayShape = getDisplayShape(targetShape);
      const bounds = getShapeBounds(displayShape);
      const spanStart =
        displayShape.shape === "Line"
          ? { x: displayShape.startX, y: displayShape.startY }
          : { x: bounds.x, y: bounds.y };
      const spanEnd =
        displayShape.shape === "Line"
          ? { x: displayShape.endX, y: displayShape.endY }
          : { x: bounds.x + bounds.width, y: bounds.y };
      const spanDeltaX = spanEnd.x - spanStart.x;
      const spanDeltaY = spanEnd.y - spanStart.y;
      const spanLength = Math.max(1, Math.hypot(spanDeltaX, spanDeltaY));
      const arrowCount = Math.max(
        3,
        Math.min(9, Math.round((spanLength * zoom) / 48) + 1),
      );
      const directionDeltaX = item.endX - item.startX;
      const directionDeltaY = item.endY - item.startY;
      const directionLength = Math.max(
        1,
        Math.hypot(directionDeltaX, directionDeltaY),
      );
      const directionX = directionDeltaX / directionLength;
      const directionY = directionDeltaY / directionLength;
      const arrowLength = 36 / zoom;
      const loadArrows = Array.from({ length: arrowCount }, (_, index) => {
        const progress = arrowCount === 1 ? 0.5 : index / (arrowCount - 1);
        const endX = spanStart.x + spanDeltaX * progress;
        const endY = spanStart.y + spanDeltaY * progress;

        return {
          endX,
          endY,
          startX: endX - directionX * arrowLength,
          startY: endY - directionY * arrowLength,
        };
      });
      const firstArrow = loadArrows[0];
      const lastArrow = loadArrows[loadArrows.length - 1];
      const labelX = (firstArrow.startX + lastArrow.startX) / 2;
      const labelY = (firstArrow.startY + lastArrow.startY) / 2;

      return (
        <g
          key={key}
          className={`${className} applied-load`}
          onPointerDown={
            !draft && "id" in item
              ? (event) => handleForcePointerDown(event, item.id)
              : undefined
          }
        >
          <line
            className="applied-load-hit-target"
            x1={firstArrow.startX}
            y1={firstArrow.startY}
            x2={lastArrow.startX}
            y2={lastArrow.startY}
          />
          <line
            className="applied-load-cap"
            x1={firstArrow.startX}
            y1={firstArrow.startY}
            x2={lastArrow.startX}
            y2={lastArrow.startY}
          />

          {loadArrows.map((arrow, index) => (
            <line
              key={index}
              className="applied-load-arrow"
              x1={arrow.startX}
              y1={arrow.startY}
              x2={arrow.endX}
              y2={arrow.endY}
              markerEnd="url(#force-arrowhead)"
            />
          ))}

          {isSelectedForce && "id" in item ? (
            <foreignObject
              className="force-inline-editor-object"
              x={labelX - 103}
              y={labelY - 48}
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
                  aria-label="Load name"
                  title="Load name"
                  value={item.name}
                  onFocus={(event) => event.currentTarget.select()}
                  onChange={(event) =>
                    updateForceName(item.id, event.currentTarget.value)
                  }
                />

                <span className="force-inline-separator" aria-hidden="true" />

                <label className="force-inline-value" title="Load intensity">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    aria-label="Load intensity"
                    value={formatLoadMagnitude(item.magnitude)}
                    onFocus={(event) => event.currentTarget.select()}
                    onChange={(event) =>
                      updateForceMagnitude(item.id, event.currentTarget.value)
                    }
                  />
                  <span>{`N/${dimensionUnit}`}</span>
                </label>

                <span className="force-inline-separator" aria-hidden="true" />

                <label className="force-inline-value" title="Load direction">
                  <input
                    type="number"
                    step="any"
                    aria-label="Load angle"
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
          ) : (
            <text x={labelX + 8 / zoom} y={labelY - 8 / zoom}>
              {item.name} = {formatLoadMagnitude(item.magnitude)} N/{dimensionUnit}
            </text>
          )}
        </g>
      );
    }

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

          {!isSelectedForce && (
            <text x={midpointX + 8} y={midpointY - 8}>
              {item.name} ={" "}
              {item.kind === "Applied Load"
                ? formatDimensionValue(item.magnitude)
                : item.magnitude}{" "}
              {item.kind === "Applied Load"
                ? `N·${dimensionUnit}`
                : "N"}
            </text>
          )}
        </g>
      );
    }

    if (item.category === "support") {
      const x = item.startX;
      const y = item.startY;

      if (item.kind === "Pin Support") {
        const rotation =
          !draft && "id" in item ? getSupportRotationDegrees(item) : 0;

        return (
          <g
            key={key}
            className={className}
            onPointerDown={
              !draft && "id" in item
                ? (event) => handleSupportPointerDown(event, item.id)
                : undefined
            }
          >
            <g transform={`rotate(${rotation} ${x} ${y})`}>
              <path
                className="support-body"
                d={`M ${x} ${y} L ${x - 15} ${y + 23} L ${x + 15} ${
                  y + 23
                } Z`}
              />
              <line x1={x - 20} y1={y + 27} x2={x + 20} y2={y + 27} />
            </g>
            {!draft && "id" in item ? renderSupportReactions(item) : null}
          </g>
        );
      }

      if (item.kind === "Roller Support") {
        const rotation =
          !draft && "id" in item ? getSupportRotationDegrees(item) : 0;

        return (
          <g
            key={key}
            className={className}
            onPointerDown={
              !draft && "id" in item
                ? (event) => handleSupportPointerDown(event, item.id)
                : undefined
            }
          >
            <g transform={`rotate(${rotation} ${x} ${y})`}>
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
            {!draft && "id" in item ? renderSupportReactions(item) : null}
          </g>
        );
      }

      return (
        <g
          key={key}
          className={className}
          onPointerDown={
            !draft && "id" in item
              ? (event) => handleSupportPointerDown(event, item.id)
              : undefined
          }
        >
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
          {!draft && "id" in item ? renderSupportReactions(item) : null}
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
          draftForceOriginRef.current = null;
          forceMidpointsActiveRef.current = false;
          setShowForceMidpoints(false);
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

            {showForceMidpoints &&
              drawnShapes.map((shape) => (
                <g
                  key={`midpoints-${shape.id}`}
                  className="shape-midpoint-markers"
                >
                  {getShapeMidpoints(getDisplayShape(shape)).map(
                    (midpoint, index) => {
                      const markerSize = 5 / zoom;

                      return (
                        <path
                          key={index}
                          className="shape-midpoint-marker"
                          d={`M ${midpoint.x} ${midpoint.y - markerSize}
                            L ${midpoint.x + markerSize} ${midpoint.y + markerSize * 0.85}
                            L ${midpoint.x - markerSize} ${midpoint.y + markerSize * 0.85}
                            Z`}
                        />
                      );
                    },
                  )}
                </g>
              ))}

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

          <div
            className={`section-content ${shapesOpen ? "is-open" : ""}`}
            aria-hidden={!shapesOpen}
          >
            <div className="section-content-inner">
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
            </div>
          </div>
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

          <div
            className={`section-content ${forcesOpen ? "is-open" : ""}`}
            aria-hidden={!forcesOpen}
          >
            <div className="section-content-inner">
              <div className="shape-list">
                {forceTools.map((tool) => {
                  const active = selectedForceTool === tool;

                  return (
                    <button
                      className={`shape-button ${active ? "is-active" : ""}`}
                      type="button"
                      key={tool}
                      aria-pressed={active}
                      disabled={tool === "Applied Load" && drawnShapes.length === 0}
                      title={
                        tool === "Applied Load" && drawnShapes.length === 0
                          ? "Draw a shape before applying a distributed load"
                          : undefined
                      }
                      onClick={() => toggleForceTool(tool)}
                    >
                      <ToolIcon tool={tool} />
                      <span>{tool}</span>
                    </button>
                  );
                })}
              </div>

              <button
                className="force-mode-toggle"
                type="button"
                role="switch"
                aria-checked={orthogonalForces}
                onClick={() =>
                  setOrthogonalForces((current) => !current)
                }
              >
                <span>Orthogonal</span>
                <span
                  className={`force-mode-switch ${
                    orthogonalForces ? "is-on" : ""
                  }`}
                  aria-hidden="true"
                >
                  <span />
                </span>
              </button>

              {selectedForceItem?.kind === "Applied Force" && (
                <div
                  className="sidebar-force-editor"
                  onPointerDown={(event) => event.stopPropagation()}
                >
                  <input
                    className="sidebar-force-name"
                    type="text"
                    aria-label="Force name"
                    title="Force name"
                    value={selectedForceItem.name}
                    onFocus={(event) => event.currentTarget.select()}
                    onChange={(event) =>
                      updateForceName(
                        selectedForceItem.id,
                        event.currentTarget.value,
                      )
                    }
                  />

                  <span className="sidebar-force-separator" aria-hidden="true" />

                  <label className="sidebar-force-value" title="Magnitude">
                    <input
                      type="number"
                      min="0"
                      step="any"
                      aria-label="Force magnitude"
                      value={selectedForceItem.magnitude}
                      onFocus={(event) => event.currentTarget.select()}
                      onChange={(event) =>
                        updateForceMagnitude(
                          selectedForceItem.id,
                          event.currentTarget.value,
                        )
                      }
                    />
                    <span>N</span>
                  </label>

                  <span className="sidebar-force-separator" aria-hidden="true" />

                  <label className="sidebar-force-value" title="Angle from +x">
                    <input
                      type="number"
                      step="any"
                      aria-label="Force angle"
                      value={Number(
                        getForceAngle(selectedForceItem).toFixed(1),
                      )}
                      onFocus={(event) => event.currentTarget.select()}
                      onChange={(event) =>
                        updateForceAngle(
                          selectedForceItem.id,
                          event.currentTarget.value,
                        )
                      }
                    />
                    <span>°</span>
                  </label>
                </div>
              )}
            </div>
          </div>
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

          <div
            className={`section-content ${supportsOpen ? "is-open" : ""}`}
            aria-hidden={!supportsOpen}
          >
            <div className="section-content-inner">
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
            </div>
          </div>
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

          <div
            className={`section-content ${connectionsOpen ? "is-open" : ""}`}
            aria-hidden={!connectionsOpen}
          >
            <div className="section-content-inner">
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
            </div>
          </div>
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

          <div
            className={`section-content ${canvasControlsOpen ? "is-open" : ""}`}
            aria-hidden={!canvasControlsOpen}
          >
            <div className="section-content-inner">
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
            </div>
          </div>
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
