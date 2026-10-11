import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { LegacyProfile as Profile } from "../sketch/types";
interface Props {
  profile: Profile;
  onChange: (p: Profile) => void;
  tool: "rectangle" | "circle" | "select";
  plane: string;
  fitStamp?: number;
  referenceLines?: number[];
}
export default function LegacySketchCanvas({
  profile,
  onChange,
  tool,
  plane,
  fitStamp = 0,
  referenceLines,
}: Props) {
  const svg = useRef<SVGSVGElement>(null);
  const start = useRef<[number, number] | null>(null);
  const gridId = useId().replace(/:/g, "");
  const [size, setSize] = useState({ width: 1, height: 1 });
  const [view, setView] = useState({ minX: -160, minY: -110, width: 320, height: 220 });
  const previousFit = useRef<number | null>(null);
  const fittedReference = useRef(false);
  const interacted = useRef(false);
  const profileRef = useRef(profile);
  profileRef.current = profile;
  const referenceSegments = useMemo(() => {
    const segments: [number, number, number, number][] = [];
    for (let i = 0; referenceLines && i + 3 < referenceLines.length; i += 4) {
      const segment = referenceLines.slice(i, i + 4);
      if (segment.every(Number.isFinite)) segments.push(segment as [number, number, number, number]);
    }
    return segments;
  }, [referenceLines]);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setSize({ width: Math.max(1, entry.contentRect.width), height: Math.max(1, entry.contentRect.height) }));
    observer.observe(svg.current!);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const firstReference = !fittedReference.current && !interacted.current && referenceSegments.length > 0;
    if ((previousFit.current === fitStamp && !firstReference) || size.width <= 1 || size.height <= 1) return;
    previousFit.current = fitStamp;
    if (referenceSegments.length) fittedReference.current = true;
    const current = profileRef.current;
    const width = current.kind === "rectangle" ? current.width : current.radius * 2;
    const height = current.kind === "rectangle" ? current.height : current.radius * 2;
    let minX = current.center[0] - width / 2, maxX = current.center[0] + width / 2;
    let minY = current.center[1] - height / 2, maxY = current.center[1] + height / 2;
    for (const [x1, y1, x2, y2] of referenceSegments) {
      minX = Math.min(minX, x1, x2); maxX = Math.max(maxX, x1, x2);
      minY = Math.min(minY, y1, y2); maxY = Math.max(maxY, y1, y2);
    }
    const scale = Math.max(1e-6, Math.min(30, Math.max(40, size.width - 160) / Math.max(40, maxX - minX), Math.max(40, size.height - 170) / Math.max(40, maxY - minY)));
    const viewWidth = size.width / scale, viewHeight = size.height / scale;
    setView({ minX: (minX + maxX - viewWidth) / 2, minY: -(minY + maxY + viewHeight) / 2, width: viewWidth, height: viewHeight });
  }, [fitStamp, size, referenceSegments]);
  const point = (e: React.PointerEvent) => {
    const rect = svg.current!.getBoundingClientRect();
    const scale = Math.min(rect.width / view.width, rect.height / view.height);
    return [
      Math.round((e.clientX - rect.left - rect.width / 2) / scale + view.minX + view.width / 2),
      Math.round(-((e.clientY - rect.top - rect.height / 2) / scale + view.minY + view.height / 2)),
    ] as [number, number];
  };
  const move = (e: React.PointerEvent) => {
    if (!start.current) return;
    const p = point(e),
      s = start.current;
    if (tool === "rectangle")
      onChange({
        kind: "rectangle",
        center: [(p[0] + s[0]) / 2, (p[1] + s[1]) / 2],
        width: Math.max(1, Math.abs(p[0] - s[0])),
        height: Math.max(1, Math.abs(p[1] - s[1])),
      });
    else
      onChange({
        kind: "circle",
        center: s,
        radius: Math.max(1, Math.round(Math.hypot(p[0] - s[0], p[1] - s[1]))),
      });
  };
  const [x, y] = profile.center;
  const w = profile.kind === "rectangle" ? profile.width : profile.radius * 2;
  const h = profile.kind === "rectangle" ? profile.height : profile.radius * 2;
  const gridStep = 10 * 10 ** Math.max(0, Math.ceil(Math.log10(4 / (10 * Math.min(size.width / view.width, size.height / view.height)))));
  return (
    <div className={"sketch-canvas tool-" + tool}>
      <svg
        ref={svg}
        viewBox={`${view.minX} ${view.minY} ${view.width} ${view.height}`}
        onPointerDown={(e) => {
          interacted.current = true;
          if (tool === "select") return;
          start.current = point(e);
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={move}
        onPointerUp={(e) => {
          move(e);
          start.current = null;
        }}
        onPointerCancel={() => {
          start.current = null;
        }}
        aria-label="Editor de croquis"
      >
        <defs>
          <pattern
            id={gridId}
            width={gridStep}
            height={gridStep}
            patternUnits="userSpaceOnUse"
          >
            <path
              d={`M ${gridStep} 0 L 0 0 0 ${gridStep}`}
              fill="none"
              stroke="#cad9e6"
              strokeWidth=".2"
            />
          </pattern>
        </defs>
        <rect
          x={view.minX}
          y={view.minY}
          width={view.width}
          height={view.height}
          fill={`url(#${gridId})`}
        />
        <path d={`M${view.minX} 0H${view.minX + view.width}M0 ${view.minY}V${view.minY + view.height}`} stroke="#9babbc" strokeWidth=".28" />
        <path data-sketch-reference="true" d={referenceSegments.map(([x1, y1, x2, y2]) => `M${x1} ${-y1}L${x2} ${-y2}`).join(" ")} fill="none" stroke="#778795" strokeWidth="1.2" opacity=".5" vectorEffect="non-scaling-stroke" pointerEvents="none" aria-hidden="true" />
        <g
          transform="scale(1,-1)"
          fill="#2488d514"
          stroke="#1972be"
          strokeWidth=".6"
        >
          {profile.kind === "rectangle" ? (
            <rect x={x - w / 2} y={y - h / 2} width={w} height={h} />
          ) : (
            <circle cx={x} cy={y} r={profile.radius} />
          )}
        </g>
        <g stroke="#2476b5" strokeWidth=".24" fill="none">
          <path
            d={`M${x - w / 2} ${-y + h / 2 + 3}v10M${x + w / 2} ${-y + h / 2 + 3}v10M${x - w / 2} ${-y + h / 2 + 10}h${w}`}
          />
          <path
            d={`M${x + w / 2 + 3} ${-y - h / 2}h10M${x + w / 2 + 3} ${-y + h / 2}h10M${x + w / 2 + 10} ${-y - h / 2}v${h}`}
          />
        </g>
        <g fill="#135e9c" fontSize="3.8" fontFamily="Segoe UI, sans-serif">
          <text x={x} y={-y + h / 2 + 9} textAnchor="middle">
            {profile.kind === "circle" ? "Ø " : ""}
            {w.toFixed(1)}
          </text>
          <text
            x={x + w / 2 + 12}
            y={-y}
            transform={`rotate(-90 ${x + w / 2 + 12} ${-y})`}
            textAnchor="middle"
          >
            {h.toFixed(1)}
          </text>
        </g>
        <path d="M0 0h8M0 0v-8" stroke="#cf4942" strokeWidth=".65" />
        <circle cx="0" cy="0" r=".9" fill="#cf4942" />
      </svg>
      <div className="sketch-caption">
        {plane} · Cotas en milímetros · Cuadrícula de 10 mm
      </div>
    </div>
  );
}
