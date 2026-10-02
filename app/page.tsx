"use client";

import { useState } from "react";

type ViewMode = "2D" | "3D";
type Shape = "Square" | "Rectangle" | "Circle" | "Triangle" | "Line";

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

  return (
    <main className="editor-shell">
      <section className="canvas" aria-label={`${mode} drawing canvas`}>
        <div className="canvas-grid" />
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
