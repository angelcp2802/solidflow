import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { HolePosition } from "../cad/kernel.types";

interface Props {
  positions: HolePosition[];
  onChange: (positions: HolePosition[]) => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  diameter: number;
  headDiameter: number;
  referenceLines?: number[];
  fitStamp: number;
  plane: string;
}
type Point = [number, number];
type Gesture =
  | { kind: "pan"; id: number; screen: Point; center: Point }
  | { kind: "add"; id: number; screen: Point }
  | {
      kind: "move";
      id: number;
      screen: Point;
      world: Point;
      position: HolePosition;
    };

/** A planar centre editor. Coordinates are local to the resolved support frame. */
export default function HolePositionsCanvas({
  positions,
  onChange,
  selectedId,
  onSelect,
  diameter,
  headDiameter,
  referenceLines,
  fitStamp,
  plane,
}: Props) {
  const svg = useRef<SVGSVGElement>(null);
  const patternId = useId().replace(/:/g, "");
  const [size, setSize] = useState({ width: 1, height: 1 });
  const [view, setView] = useState({ center: [0, 0] as Point, scale: 4 });
  const [preview, setPreview] = useState<HolePosition | null>(null);
  const [message, setMessage] = useState("");
  const gesture = useRef<Gesture | null>(null);
  const fitted = useRef<number | null>(null);
  const fittedReference = useRef(false);
  const interacted = useRef(false);
  const currentPositions = useRef(positions);
  currentPositions.current = positions;
  const segments = useMemo(() => {
    const lines: number[][] = [];
    for (let i = 0; referenceLines && i + 3 < referenceLines.length; i += 4) {
      const line = referenceLines.slice(i, i + 4);
      if (line.every(Number.isFinite)) lines.push(line);
    }
    return lines;
  }, [referenceLines]);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) =>
      setSize({
        width: Math.max(1, entry.contentRect.width),
        height: Math.max(1, entry.contentRect.height),
      }),
    );
    observer.observe(svg.current!);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const firstReference =
      !fittedReference.current && !interacted.current && segments.length > 0;
    if (
      size.width <= 1 ||
      size.height <= 1 ||
      (fitted.current === fitStamp && !firstReference)
    )
      return;
    fitted.current = fitStamp;
    if (segments.length) fittedReference.current = true;
    const points = currentPositions.current
      .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
      .map((p) => [p.x, p.y]);
    segments.forEach(([x1, y1, x2, y2]) => points.push([x1, y1], [x2, y2]));
    if (!points.length) points.push([-40, -30], [40, 30]);
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (const [x, y] of points) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    setView({
      center: [(minX + maxX) / 2, (minY + maxY) / 2],
      scale: Math.max(
        1e-6,
        Math.min(
          30,
          Math.max(40, size.width - 160) / Math.max(40, maxX - minX),
          Math.max(40, size.height - 180) / Math.max(40, maxY - minY),
        ),
      ),
    });
  }, [fitStamp, segments, size]);
  const screen = ([x, y]: Point): Point => [
    (x - view.center[0]) * view.scale + size.width / 2,
    size.height / 2 - (y - view.center[1]) * view.scale,
  ];
  const world = ([x, y]: Point): Point => [
    (x - size.width / 2) / view.scale + view.center[0],
    (size.height / 2 - y) / view.scale + view.center[1],
  ];
  const local = (event: { clientX: number; clientY: number }): Point => {
    const rect = svg.current!.getBoundingClientRect();
    return [event.clientX - rect.left, event.clientY - rect.top];
  };
  const bounded = (value: number) =>
    Math.max(-1e6, Math.min(1e6, Math.round(value * 1000) / 1000));
  const movedPosition = (
    active: Extract<Gesture, { kind: "move" }>,
    point: Point,
  ): HolePosition => {
    const next = world(point);
    return {
      ...active.position,
      x: bounded(active.position.x + next[0] - active.world[0]),
      y: bounded(active.position.y + next[1] - active.world[1]),
    };
  };
  const down = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!event.isPrimary || gesture.current) return;
    interacted.current = true;
    svg.current!.focus({ preventScroll: true });
    const point = local(event);
    if (event.button === 1 || event.button === 2) {
      event.preventDefault();
      gesture.current = {
        kind: "pan",
        id: event.pointerId,
        screen: point,
        center: view.center,
      };
    } else if (event.button === 0) {
      const id = (event.target as Element)
        .closest("[data-hole-position]")
        ?.getAttribute("data-hole-position");
      const position = positions.find((p) => p.id === id);
      if (position) {
        onSelect(position.id);
        gesture.current = {
          kind: "move",
          id: event.pointerId,
          screen: point,
          world: world(point),
          position,
        };
      } else
        gesture.current = { kind: "add", id: event.pointerId, screen: point };
    } else return;
    setMessage("");
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const move = (event: ReactPointerEvent<SVGSVGElement>) => {
    const active = gesture.current;
    if (!active || active.id !== event.pointerId) return;
    const point = local(event);
    if (active.kind === "pan")
      setView((previous) => ({
        ...previous,
        center: [
          active.center[0] - (point[0] - active.screen[0]) / previous.scale,
          active.center[1] + (point[1] - active.screen[1]) / previous.scale,
        ],
      }));
    else if (
      active.kind === "move" &&
      Math.hypot(point[0] - active.screen[0], point[1] - active.screen[1]) > 3
    )
      setPreview(movedPosition(active, point));
  };
  const up = (event: ReactPointerEvent<SVGSVGElement>) => {
    const active = gesture.current;
    if (!active || active.id !== event.pointerId) return;
    const point = local(event),
      distance = Math.hypot(
        point[0] - active.screen[0],
        point[1] - active.screen[1],
      );
    gesture.current = null;
    setPreview(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    if (active.kind === "move" && distance > 3) {
      const next = movedPosition(active, point);
      onChange(
        positions.map((position) =>
          position.id === next.id ? next : position,
        ),
      );
    } else if (active.kind === "add" && distance < 4) {
      if (positions.length >= 128) {
        setMessage("Puedes colocar hasta 128 taladros en una operación.");
        return;
      }
      const coordinates = world(point);
      const next = {
        id: crypto.randomUUID(),
        x: bounded(coordinates[0]),
        y: bounded(coordinates[1]),
      };
      onChange([...positions, next]);
      onSelect(next.id);
    }
  };
  const cancelGesture = () => {
    gesture.current = null;
    setPreview(null);
  };
  const removeSelected = () => {
    if (!selectedId) return;
    onChange(positions.filter((position) => position.id !== selectedId));
    onSelect(null);
  };
  const origin = screen([0, 0]);
  const step = 10 * view.scale;
  const displayPositions = positions.map((position) =>
    preview?.id === position.id ? preview : position,
  );
  return (
    <div className="sketch-canvas hole-positions-canvas">
      <svg
        ref={svg}
        role="application"
        aria-label="Posiciones del asistente para taladro"
        tabIndex={0}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={cancelGesture}
        onLostPointerCapture={cancelGesture}
        onContextMenu={(event) => event.preventDefault()}
        onKeyDown={(event) => {
          if (event.key === "Delete" || event.key === "Backspace") {
            event.preventDefault();
            event.stopPropagation();
            removeSelected();
          }
        }}
        onWheel={(event) => {
          const point = local(event),
            anchor = world(point);
          interacted.current = true;
          setView((previous) => {
            const scale = Math.max(
              1e-6,
              Math.min(2000, previous.scale * Math.exp(-event.deltaY * 0.001)),
            );
            return {
              scale,
              center: [
                anchor[0] - (point[0] - size.width / 2) / scale,
                anchor[1] + (point[1] - size.height / 2) / scale,
              ],
            };
          });
        }}
      >
        <defs>
          <pattern
            id={patternId}
            x={origin[0]}
            y={origin[1]}
            width={step}
            height={step}
            patternUnits="userSpaceOnUse"
          >
            <path
              d={`M ${step} 0 L 0 0 0 ${step}`}
              fill="none"
              stroke="#dce6ee"
              strokeWidth="0.7"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${patternId})`} />
        <path
          d={`M 0 ${origin[1]} H ${size.width} M ${origin[0]} 0 V ${size.height}`}
          stroke="#a7bac8"
          strokeWidth="1"
        />
        <g stroke="#93a7b7" strokeWidth="1.2" fill="none" pointerEvents="none">
          {segments.map(([x1, y1, x2, y2], index) => {
            const a = screen([x1, y1]),
              b = screen([x2, y2]);
            return <line key={index} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} />;
          })}
        </g>
        <path
          d={`M ${origin[0] - 7} ${origin[1]} h 14 M ${origin[0]} ${origin[1] - 7} v 14`}
          stroke="#b65666"
          strokeWidth="1.5"
          pointerEvents="none"
        />
        {displayPositions
          .filter(
            (position) =>
              Number.isFinite(position.x) && Number.isFinite(position.y),
          )
          .map((position, index) => {
            const point = screen([position.x, position.y]);
            const selected = selectedId === position.id;
            const radius =
              Number.isFinite(diameter) && diameter > 0
                ? (diameter * view.scale) / 2
                : 0;
            const outer =
              Number.isFinite(headDiameter) && headDiameter > diameter
                ? (headDiameter * view.scale) / 2
                : 0;
            return (
              <g
                key={position.id}
                data-hole-position={position.id}
                role="button"
                aria-label={`Posición ${index + 1}: X ${position.x}, Y ${position.y}`}
                aria-pressed={selected}
                tabIndex={0}
                onFocus={() => onSelect(position.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    event.stopPropagation();
                    onSelect(position.id);
                  }
                }}
              >
                {outer > 0 && (
                  <circle
                    cx={point[0]}
                    cy={point[1]}
                    r={outer}
                    fill="none"
                    stroke="#5b8caa"
                    strokeDasharray="4 3"
                    pointerEvents="none"
                  />
                )}
                <circle
                  cx={point[0]}
                  cy={point[1]}
                  r={radius}
                  fill={selected ? "#cae8f488" : "#f4faff88"}
                  stroke={selected ? "#006aab" : "#3187b2"}
                  strokeWidth={selected ? 2 : 1.4}
                />
                <circle cx={point[0]} cy={point[1]} r="10" fill="transparent" />
                <path
                  d={`M ${point[0] - 6} ${point[1]} h 12 M ${point[0]} ${point[1] - 6} v 12`}
                  stroke="#007bb6"
                  strokeWidth="2"
                />
                <text
                  x={point[0] + Math.max(radius, 7) + 6}
                  y={point[1] - 7}
                  fill="#16688d"
                  fontSize="12"
                >
                  {index + 1}
                </text>
              </g>
            );
          })}
      </svg>
      <div className="hole-position-help" role="status">
        <span>
          {message ||
            "Pulsa para añadir centros · Arrastra un centro para moverlo · Supr: eliminar"}
        </span>
        <span>
          {plane} · Coordenadas locales en mm · Rueda: zoom · Botón central:
          desplazar
        </span>
      </div>
    </div>
  );
}
