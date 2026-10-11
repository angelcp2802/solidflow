import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { Profile } from "../cad/kernel.types";
import type {
  EntityProfile,
  SketchConstraint,
  SketchEntity,
  SketchSelection,
  SketchSolveResult,
  SketchTool,
} from "../sketch/types";
import {
  appendArc,
  appendCircle,
  appendLine,
  appendRectangle,
  entityPoints,
  measureEntity,
  measureAngle,
  sketchBounds,
  sketchPoint,
  snapSketchPoint,
  translateSelection,
} from "../sketch/editing";
import type { SnapPoint } from "../sketch/editing";
import { validateEntityProfile } from "../sketch/validation";
import { angleText, lengthText } from "../sketch/formatting";
import { previewTrimToClosest, trimToClosest } from "../sketch/trim";
import { previewExtendToClosest, extendToClosest } from "../sketch/extend";
import type { TrimSegment } from "../sketch/trim";
import type { ChamferPlan } from "../sketch/chamfer";
import type { FilletPlan, FilletBatchPlan } from "../sketch/fillet";
import LegacySketchCanvas from "./LegacySketchCanvas";

interface Props {
  profile: Profile;
  onChange: (profile: Profile) => void;
  tool: SketchTool;
  plane: string;
  selection: SketchSelection[];
  onSelection: (selection: SketchSelection[]) => void;
  solution: SketchSolveResult | null;
  fitStamp: number;
  referenceLines?: number[];
  chamferPreview?: ChamferPlan | null;
  filletPreview?: FilletPlan | FilletBatchPlan | null;
}
type Point = [number, number];
type Draft = {
  tool: Exclude<SketchTool, "select" | "trim" | "extend" | "chamfer" | "fillet">;
  anchors: SnapPoint[];
};
type Gesture =
  | { kind: "pan"; pointerId: number; screen: Point; center: Point }
  | {
      kind: "boundary";
      tool: "trim" | "extend";
      pointerId: number;
      screen: Point;
      world: Point;
      base: EntityProfile;
      entityId: string;
    }
  | {
      kind: "draw";
      pointerId: number;
      screen: Point;
      start: SnapPoint;
      hadAnchor: boolean;
    }
  | {
      kind: "move";
      pointerId: number;
      screen: Point;
      world: Point;
      base: EntityProfile;
      selection: SketchSelection[];
      movedIds: Set<string>;
    };
const coords = (point: SnapPoint): Point => [point.x, point.y];
const sameSelection = (a: SketchSelection, b: SketchSelection) =>
  a.kind === b.kind && a.id === b.id;

export default function SketchCanvas(props: Props) {
  if (props.profile.kind !== "entities")
    return (
      <LegacySketchCanvas
        profile={props.profile}
        onChange={props.onChange}
        tool={
          props.tool === "line" ||
          props.tool === "arc" ||
          props.tool === "trim" ||
          props.tool === "extend" ||
          props.tool === "chamfer" || props.tool === "fillet"
            ? "select"
            : props.tool
        }
        plane={props.plane}
        fitStamp={props.fitStamp}
        referenceLines={props.referenceLines}
      />
    );
  return <EntitySketchCanvas {...props} profile={props.profile} />;
}

function EntitySketchCanvas({
  profile: sourceProfile,
  onChange,
  tool,
  plane,
  selection,
  onSelection,
  solution,
  fitStamp,
  referenceLines,
  chamferPreview,
  filletPreview,
}: Props & { profile: EntityProfile }) {
  const profile =
    solution && ["underdefined", "fullyDefined"].includes(solution.status)
      ? solution.profile
      : sourceProfile;
  const svg = useRef<SVGSVGElement>(null);
  const gridId = useId().replace(/:/g, "");
  const [size, setSize] = useState({ width: 1, height: 1 });
  const [view, setView] = useState({ center: [0, 0] as Point, scale: 3 });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [hover, setHover] = useState<SnapPoint | null>(null);
  const [hovered, setHovered] = useState<SketchSelection | null>(null);
  const [preview, setPreview] = useState<EntityProfile | null>(null);
  const [message, setMessage] = useState("");
  const [trimNotice, setTrimNotice] = useState("");
  const [trimPreview, setTrimPreview] = useState<ReturnType<
    typeof previewTrimToClosest
  > | null>(null);
  const [extendPreview, setExtendPreview] = useState<ReturnType<
    typeof previewExtendToClosest
  > | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const previousFit = useRef<number | null>(null);
  const fittedReference = useRef(false);
  const interacted = useRef(false);
  const profileRef = useRef(profile);
  profileRef.current = profile;
  const referenceSegments = useMemo(() => {
    const segments: [number, number, number, number][] = [];
    for (let i = 0; referenceLines && i + 3 < referenceLines.length; i += 4) {
      const segment = referenceLines.slice(i, i + 4);
      if (segment.every(Number.isFinite))
        segments.push(segment as [number, number, number, number]);
    }
    return segments;
  }, [referenceLines]);
  const displayed = preview ?? profile;
  const visibleChamfer =
    tool === "chamfer" &&
    chamferPreview?.changed &&
    chamferPreview.sourceProfile === profile &&
    solution && ["underdefined", "fullyDefined"].includes(solution.status)
      ? chamferPreview
      : null;
  const visibleFillet = tool === "fillet" && filletPreview?.changed &&
    filletPreview.sourceProfile === profile &&
    solution && ["underdefined", "fullyDefined"].includes(solution.status)
      ? filletPreview : null;
  const screen = (point: Point): Point => [
    (point[0] - view.center[0]) * view.scale + size.width / 2,
    size.height / 2 - (point[1] - view.center[1]) * view.scale,
  ];
  const world = (point: Point): Point => [
    (point[0] - size.width / 2) / view.scale + view.center[0],
    -(point[1] - size.height / 2) / view.scale + view.center[1],
  ];
  const local = (event: { clientX: number; clientY: number }): Point => {
    const bounds = svg.current!.getBoundingClientRect();
    return [event.clientX - bounds.left, event.clientY - bounds.top];
  };
  const selected = (kind: SketchSelection["kind"], id: string) =>
    selection.some((item) => item.kind === kind && item.id === id);
  const isHovered = (kind: SketchSelection["kind"], id: string) =>
    hovered?.kind === kind && hovered.id === id;

  useLayoutEffect(() => {
    const element = svg.current!;
    // Fit before the first visible frame instead of painting the initial 1×1 view.
    const initialBounds = element.getBoundingClientRect();
    setSize({
      width: Math.max(1, initialBounds.width),
      height: Math.max(1, initialBounds.height),
    });
    const observer = new ResizeObserver(([entry]) =>
      setSize({
        width: Math.max(1, entry.contentRect.width),
        height: Math.max(1, entry.contentRect.height),
      }),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    const firstReference =
      !fittedReference.current &&
      !interacted.current &&
      referenceSegments.length > 0;
    if (
      (previousFit.current === fitStamp && !firstReference) ||
      size.width <= 1 ||
      size.height <= 1
    )
      return;
    previousFit.current = fitStamp;
    if (referenceSegments.length) fittedReference.current = true;
    const current = profileRef.current;
    const bounds =
      referenceSegments.length &&
      !current.points.length &&
      !current.entities.length
        ? { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
        : sketchBounds(current);
    for (const [x1, y1, x2, y2] of referenceSegments) {
      bounds.minX = Math.min(bounds.minX, x1, x2);
      bounds.maxX = Math.max(bounds.maxX, x1, x2);
      bounds.minY = Math.min(bounds.minY, y1, y2);
      bounds.maxY = Math.max(bounds.maxY, y1, y2);
    }
    setView({
      center: [
        (bounds.minX + bounds.maxX) / 2,
        (bounds.minY + bounds.maxY) / 2,
      ],
      scale: Math.max(
        1e-6,
        Math.min(
          30,
          // Reserve space for the fixed-size angular arcs and their labels.
          Math.max(40, size.width - 220) /
            Math.max(40, bounds.maxX - bounds.minX),
          Math.max(40, size.height - 220) /
            Math.max(40, bounds.maxY - bounds.minY),
        ),
      ),
    });
  }, [fitStamp, size, referenceSegments]);
  useEffect(() => {
    setDraft(null);
    setHover(null);
    setPreview(null);
    setTrimPreview(null);
    setExtendPreview(null);
    setTrimNotice("");
    gesture.current = null;
    setMessage("");
  }, [tool]);
  // Undo, deletion and panel edits invalidate a gesture's captured geometry.
  // Never let pointerup restore a profile that the document has already replaced.
  useEffect(() => {
    setDraft(null);
    setHover(null);
    setPreview(null);
    setTrimPreview(null);
    setExtendPreview(null);
    gesture.current = null;
  }, [profile]);
  useEffect(() => {
    const cancel = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || (!draft && !gesture.current)) return;
      if (
        document.querySelector('[role="dialog"][aria-modal="true"]') ||
        (event.target instanceof Element &&
          event.target.closest(
            'input,textarea,select,[contenteditable="true"]',
          ))
      )
        return;
      if (gesture.current?.kind === "boundary") {
        setTrimPreview(null);
        setExtendPreview(null);
        gesture.current = null;
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      setDraft(null);
      setPreview(null);
      setHover(null);
      gesture.current = null;
      setMessage("Trazo cancelado.");
    };
    window.addEventListener("keydown", cancel, true);
    return () => window.removeEventListener("keydown", cancel, true);
  }, [draft]);
  useEffect(() => {
    const element = svg.current!;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      interacted.current = true;
      const bounds = element.getBoundingClientRect(),
        x = event.clientX - bounds.left - bounds.width / 2,
        y = event.clientY - bounds.top - bounds.height / 2;
      setView((current) => {
        const scale = Math.max(
          1e-6,
          Math.min(
            100,
            current.scale *
              Math.exp(-Math.max(-100, Math.min(100, event.deltaY)) * 0.002),
          ),
        );
        return {
          scale,
          center: [
            current.center[0] + x / current.scale - x / scale,
            current.center[1] - y / current.scale + y / scale,
          ],
        };
      });
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, []);

  const commit = (next: EntityProfile) => {
    setPreview(null);
    gesture.current = null;
    if (next === profile) return;
    try {
      onChange(validateEntityProfile(next));
      setMessage("");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudo aplicar el cambio.",
      );
    }
  };
  const drawingPoint = (
    position: Point,
    anchors = draft?.anchors ?? [],
  ): SnapPoint => {
    const snapped = snapSketchPoint(profile, world(position), view.scale);
    if (tool === "line" && anchors.length && !snapped.id) {
      const anchor = anchors[0],
        dx = Math.abs(snapped.x - anchor.x),
        dy = Math.abs(snapped.y - anchor.y);
      if (Math.min(dx, dy) * view.scale < 7)
        return dx < dy
          ? { ...snapped, x: anchor.x }
          : { ...snapped, y: anchor.y };
    }
    return snapped;
  };
  const finishShape = (shape: Draft, end: SnapPoint) => {
    const [a, b] = shape.anchors;
    let next = profile;
    if (shape.tool === "line")
      next = appendLine(profile, coords(a), coords(end), a.id, end.id);
    if (shape.tool === "rectangle")
      next = appendRectangle(profile, coords(a), coords(end), a.id, end.id);
    if (shape.tool === "circle")
      next = appendCircle(
        profile,
        coords(a),
        Math.hypot(end.x - a.x, end.y - a.y),
        a.id,
      );
    if (shape.tool === "arc" && b)
      next = appendArc(
        profile,
        coords(a),
        coords(b),
        coords(end),
        a.id,
        b.id,
        end.id,
      );
    if (next === profile) {
      setMessage("La entidad necesita un tamaño distinto de cero.");
      return;
    }
    commit(next);
    setDraft(null);
    setHover(null);
    onSelection([]);
  };
  const pickTarget = (target: EventTarget | null): SketchSelection | null => {
    if (!(target instanceof Element)) return null;
    const item = target.closest("[data-selection-kind]");
    return item
      ? {
          kind: item.getAttribute(
            "data-selection-kind",
          ) as SketchSelection["kind"],
          id: item.getAttribute("data-selection-id")!,
        }
      : null;
  };
  const pointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (gesture.current || !event.isPrimary) return;
    interacted.current = true;
    svg.current!.focus({ preventScroll: true });
    const position = local(event);
    if (event.button === 1 || event.button === 2) {
      event.preventDefault();
      gesture.current = {
        kind: "pan",
        pointerId: event.pointerId,
        screen: position,
        center: view.center,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    if (event.button !== 0) return;
    if (tool === "chamfer" || tool === "fillet") {
      const target = pickTarget(event.target);
      setMessage("");
      if (!target) {
        onSelection([]);
        return;
      }
      if (target.kind === "point") {
        const corners = selection.filter(item => item.kind === "point");
        onSelection(tool === "fillet"
          ? corners.some(item => sameSelection(item, target))
            ? corners.filter(item => !sameSelection(item, target))
            : [...corners, target]
          : [target]);
        return;
      }
      const eligible = (id: string) => {
        const entity = profile.entities.find(entity => entity.id === id);
        return entity?.type === "line" || (tool === "fillet" && entity?.type === "arc");
      };
      if (target.kind !== "entity" || !eligible(target.id)) {
        setMessage(tool === "fillet" ? "Selecciona una esquina, dos líneas o arcos para el redondeo." : "Selecciona un vértice o dos líneas adyacentes para el chaflán.");
        return;
      }
      const lines = selection.filter(item => item.kind === "entity" && eligible(item.id));
      if (lines.some(item => sameSelection(item, target)))
        onSelection(lines.filter(item => !sameSelection(item, target)));
      else if (lines.length < 2) onSelection([...lines, target]);
      else setMessage("Ya hay dos entidades seleccionadas. Quita una o limpia la selección antes de elegir otra.");
      return;
    }
    if (tool === "trim" || tool === "extend") {
      const target = pickTarget(event.target);
      if (target?.kind !== "entity") return;
      gesture.current = {
        kind: "boundary",
        tool,
        pointerId: event.pointerId,
        screen: position,
        world: world(position),
        base: profile,
        entityId: target.id,
      };
      setMessage("");
      setTrimNotice("");
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    if (tool !== "select") {
      const start = drawingPoint(position);
      gesture.current = {
        kind: "draw",
        pointerId: event.pointerId,
        screen: position,
        start,
        hadAnchor: !!draft,
      };
      if (!draft && tool !== "arc") setDraft({ tool, anchors: [start] });
      setHover(start);
      setMessage("");
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    const target = pickTarget(event.target);
    if (!target) {
      if (!event.ctrlKey && !event.shiftKey) onSelection([]);
      return;
    }
    const exists = selection.some((item) => sameSelection(item, target));
    const nextSelection =
      event.ctrlKey || event.shiftKey
        ? exists
          ? selection.filter((item) => !sameSelection(item, target))
          : [...selection, target]
        : exists
          ? selection
          : [target];
    onSelection(nextSelection);
    if (
      target.kind === "constraint" ||
      target.id === "origin" ||
      !nextSelection.some((item) => sameSelection(item, target))
    )
      return;
    const movedIds = new Set(
      nextSelection
        .filter((item) => item.kind === "point")
        .map((item) => item.id),
    );
    profile.entities.forEach((entity) => {
      if (
        nextSelection.some(
          (item) => item.kind === "entity" && item.id === entity.id,
        )
      )
        entityPoints(entity).forEach((id) => movedIds.add(id));
    });
    movedIds.delete("origin");
    gesture.current = {
      kind: "move",
      pointerId: event.pointerId,
      screen: position,
      world: world(position),
      base: profile,
      selection: nextSelection,
      movedIds,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveProfile = (
    active: Extract<Gesture, { kind: "move" }>,
    position: Point,
  ): EntityProfile => {
    const point = world(position);
    let dx = point[0] - active.world[0],
      dy = point[1] - active.world[1];
    if (active.movedIds.size === 1) {
      const initial = sketchPoint(active.base, [...active.movedIds][0]);
      const snapped = snapSketchPoint(
        active.base,
        [initial.x + dx, initial.y + dy],
        view.scale,
        active.movedIds,
      );
      dx = snapped.x - initial.x;
      dy = snapped.y - initial.y;
      setHover(snapped);
    }
    return translateSelection(active.base, active.selection, dx, dy);
  };
  const pointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const position = local(event),
      active = gesture.current;
    if (active && active.pointerId !== event.pointerId) return;
    if (active?.kind === "pan") {
      setView((current) => ({
        ...current,
        center: [
          active.center[0] - (position[0] - active.screen[0]) / current.scale,
          active.center[1] + (position[1] - active.screen[1]) / current.scale,
        ],
      }));
      return;
    }
    if (active?.kind === "move") {
      if (
        Math.hypot(
          position[0] - active.screen[0],
          position[1] - active.screen[1],
        ) > 3
      )
        setPreview(moveProfile(active, position));
      return;
    }
    if (tool === "chamfer" || tool === "fillet") {
      const target = pickTarget(event.target);
      const type = target?.kind === "entity" ? profile.entities.find(entity => entity.id === target.id)?.type : null;
      setHovered(target?.kind === "point" || (target?.kind === "entity" && (type === "line" || (tool === "fillet" && type === "arc"))) ? target : null);
      return;
    }
    if (tool === "trim" || tool === "extend") {
      if (active?.kind === "boundary") return;
      const target = pickTarget(event.target);
      setHovered(target?.kind === "entity" ? target : null);
      if (target?.kind !== "entity") {
        setTrimPreview(null);
        setExtendPreview(null);
        return;
      }
      const [x, y] = world(position);
      if (tool === "trim")
        setTrimPreview(previewTrimToClosest(profile, target.id, { x, y }));
      else
        setExtendPreview(previewExtendToClosest(profile, target.id, { x, y }));
      return;
    }
    if (tool !== "select") setHover(drawingPoint(position));
    else setHovered(pickTarget(event.target));
  };
  const pointerUp = (event: ReactPointerEvent<SVGSVGElement>) => {
    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const position = local(event);
    gesture.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    if (active.kind === "pan") return;
    if (active.kind === "boundary") {
      setTrimPreview(null);
      setExtendPreview(null);
      setHovered(null);
      if (active.base !== profile || tool !== active.tool) return;
      if (
        Math.hypot(
          position[0] - active.screen[0],
          position[1] - active.screen[1],
        ) > 5
      ) {
        setMessage(
          active.tool === "trim"
            ? "Recortar hasta más cercano: haz clic en el tramo que deseas eliminar."
            : "Extender entidades: haz clic cerca del extremo que deseas prolongar.",
        );
        return;
      }
      try {
        const [x, y] = active.world;
        const result =
          active.tool === "trim"
            ? trimToClosest(profile, active.entityId, { x, y })
            : extendToClosest(profile, active.entityId, { x, y });
        if (!result.changed) setMessage(result.message);
        else {
          commit(result.profile);
          onSelection([]);
          setTrimNotice(result.message);
        }
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : active.tool === "trim"
              ? "No se pudo recortar la entidad."
              : "No se pudo extender la entidad.",
        );
      }
      return;
    }
    if (active.kind === "move") {
      if (active.base !== profile) {
        setPreview(null);
        setHover(null);
        return;
      }
      if (
        Math.hypot(
          position[0] - active.screen[0],
          position[1] - active.screen[1],
        ) > 3
      )
        commit(moveProfile(active, position));
      setPreview(null);
      setHover(null);
      return;
    }
    if (tool === "select" || tool === "trim" || tool === "extend" || tool === "chamfer" || tool === "fillet") return;
    const end = drawingPoint(position);
    if (tool === "arc") {
      const anchors = draft?.anchors ?? [];
      if (anchors.length === 2) finishShape({ tool, anchors }, end);
      else if (
        anchors.length === 1 &&
        Math.hypot(end.x - anchors[0].x, end.y - anchors[0].y) < 0.01
      )
        setMessage("El inicio del arco debe estar separado de su centro.");
      else setDraft({ tool, anchors: [...anchors, end] });
      return;
    }
    if (active.hadAnchor && draft) finishShape(draft, end);
    else if (
      Math.hypot(
        position[0] - active.screen[0],
        position[1] - active.screen[1],
      ) > 4
    )
      finishShape(
        { tool, anchors: [active.start] },
        drawingPoint(position, [active.start]),
      );
  };
  const cancelPointer = () => {
    gesture.current = null;
    setPreview(null);
    setDraft(null);
    setHover(null);
    setTrimPreview(null);
    setExtendPreview(null);
  };

  const status = solution?.status ?? "underdefined";
  const geometryColor =
    status === "fullyDefined"
      ? "#1c252e"
      : status === "inconsistent" || status === "invalid"
        ? "#c43332"
        : "#1769c2";
  const statusText =
    status === "fullyDefined"
      ? "Completamente definido"
      : status === "inconsistent"
        ? "Restricciones incompatibles"
        : status === "invalid"
          ? "Geometría no válida"
          : status === "notConverged"
            ? "Sin convergencia"
            : `Insuficientemente definido${solution?.degreesOfFreedom != null ? ` · ${solution.degreesOfFreedom} grados de libertad` : ""}`;
  const entityPath = (entity: SketchEntity, source = displayed): string => {
    if (entity.type === "line") {
      const a = sketchPoint(source, entity.start),
        b = sketchPoint(source, entity.end);
      return `M${screen([a.x, a.y]).join(" ")}L${screen([b.x, b.y]).join(" ")}`;
    }
    const center = sketchPoint(source, entity.center),
      c = screen([center.x, center.y]),
      radius = measureEntity(source, entity) * view.scale;
    if (entity.type === "circle")
      return `M${c[0] - radius} ${c[1]}a${radius} ${radius} 0 1 0 ${radius * 2} 0a${radius} ${radius} 0 1 0 ${-radius * 2} 0`;
    const a = sketchPoint(source, entity.start),
      b = sketchPoint(source, entity.end);
    const start = Math.atan2(a.y - center.y, a.x - center.x),
      end = Math.atan2(b.y - center.y, b.x - center.x);
    const sweep = entity.clockwise
      ? (start - end + Math.PI * 2) % (Math.PI * 2)
      : (end - start + Math.PI * 2) % (Math.PI * 2);
    return `M${screen([a.x, a.y]).join(" ")}A${radius} ${radius} 0 ${sweep > Math.PI ? 1 : 0} ${entity.clockwise ? 1 : 0} ${screen([b.x, b.y]).join(" ")}`;
  };
  const trimSegmentPath = (segment: TrimSegment): string => {
    if (segment.type === "circle") {
      const [x, y] = screen(segment.center),
        r = segment.radius * view.scale;
      return `M${x - r} ${y}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0`;
    }
    const start = screen(segment.start),
      end = screen(segment.end);
    if (segment.type === "line") return `M${start.join(" ")}L${end.join(" ")}`;
    const a = Math.atan2(
      segment.start[1] - segment.center[1],
      segment.start[0] - segment.center[0],
    );
    const b = Math.atan2(
      segment.end[1] - segment.center[1],
      segment.end[0] - segment.center[0],
    );
    const sweep = segment.clockwise
      ? (a - b + Math.PI * 2) % (Math.PI * 2)
      : (b - a + Math.PI * 2) % (Math.PI * 2);
    const radius = segment.radius * view.scale;
    return `M${start.join(" ")}A${radius} ${radius} 0 ${sweep > Math.PI ? 1 : 0} ${segment.clockwise ? 1 : 0} ${end.join(" ")}`;
  };
  const constraintPosition = (
    constraint: SketchConstraint,
    index: number,
  ): Point => {
    let anchor: Point = [0, 0];
    if (
      "a" in constraint &&
      (constraint.type === "coincident" ||
        constraint.type.startsWith("distance"))
    ) {
      const a = sketchPoint(displayed, constraint.a),
        b = sketchPoint(displayed, constraint.b);
      anchor = [(a.x + b.x) / 2, (a.y + b.y) / 2];
    } else if ("pointId" in constraint) {
      const point = sketchPoint(displayed, constraint.pointId);
      anchor = [point.x, point.y];
    } else {
      const id =
        "entityId" in constraint
          ? constraint.entityId
          : "a" in constraint
            ? constraint.a
            : "";
      const entity = displayed.entities.find((entity) => entity.id === id);
      if (entity?.type === "line") {
        const a = sketchPoint(displayed, entity.start),
          b = sketchPoint(displayed, entity.end);
        anchor = [(a.x + b.x) / 2, (a.y + b.y) / 2];
      } else if (entity) {
        const c = sketchPoint(displayed, entity.center),
          radius = measureEntity(displayed, entity);
        anchor = [c.x + radius * 0.7, c.y + radius * 0.7];
      }
    }
    const position = screen(anchor);
    return [
      position[0] + (constraint.type === "distanceY" ? 22 : 0),
      position[1] - 15 - (index % 3) * 13,
    ];
  };
  const labels: Record<SketchConstraint["type"], string> = {
    fix: "Fijo",
    coincident: "●",
    horizontal: "H",
    vertical: "V",
    parallel: "∥",
    perpendicular: "⊥",
    equal: "=",
    pointOnLine: "●—",
    pointOnCircle: "●○",
    tangent: "T",
    angle: "",
    distance: "",
    distanceX: "ΔX ",
    distanceY: "ΔY ",
    length: "L ",
    radius: "R ",
  };
  const relatedEntityIds = new Set(
    displayed.constraints
      .filter(
        (constraint) =>
          (constraint.type === "angle" || constraint.type === "tangent") &&
          selected("constraint", constraint.id),
      )
      .flatMap((constraint) =>
        "a" in constraint ? [constraint.a, constraint.b] : [],
      ),
  );
  const angularDrawing = (
    constraint: Extract<SketchConstraint, { type: "angle" }>,
    index: number,
  ) => {
    const a = displayed.entities.find((entity) => entity.id === constraint.a),
      b = displayed.entities.find((entity) => entity.id === constraint.b);
    if (a?.type !== "line" || b?.type !== "line") return null;
    const p = sketchPoint(displayed, a.start),
      q = sketchPoint(displayed, a.end),
      r = sketchPoint(displayed, b.start),
      s = sketchPoint(displayed, b.end);
    const dx = q.x - p.x,
      dy = q.y - p.y,
      ex = s.x - r.x,
      ey = s.y - r.y,
      denom = dx * ey - dy * ex;
    if (Math.hypot(dx, dy) < 1e-6 || Math.hypot(ex, ey) < 1e-6) return null;
    const joint = [a.start, a.end].find((id) => id === b.start || id === b.end);
    let vertex: Point = joint
      ? coords(sketchPoint(displayed, joint))
      : [(p.x + q.x + r.x + s.x) / 4, (p.y + q.y + r.y + s.y) / 4];
    if (
      !joint &&
      Math.abs(denom) > 1e-8 * Math.hypot(dx, dy) * Math.hypot(ex, ey)
    ) {
      const t = ((r.x - p.x) * ey - (r.y - p.y) * ex) / denom;
      vertex = [p.x + t * dx, p.y + t * dy];
    }
    const center = screen(vertex);
    // Keep a readable label when an almost-parallel intersection is off-screen.
    if (
      center[0] < -size.width ||
      center[0] > size.width * 2 ||
      center[1] < -size.height ||
      center[1] > size.height * 2
    )
      return null;
    const start = Math.atan2(dy, dx) + (constraint.reversedA ? Math.PI : 0);
    let sweep: number;
    try {
      sweep = (measureAngle(displayed, a.id, b.id, constraint) * Math.PI) / 180;
    } catch {
      return null;
    }
    const sign = constraint.clockwise ? -1 : 1,
      radius = 48 + (index % 3) * 13;
    const at = (angle: number, distance = radius): Point => [
      center[0] + Math.cos(angle) * distance,
      center[1] - Math.sin(angle) * distance,
    ];
    const begin = at(start),
      end = at(start + sign * sweep),
      label = at(start + (sign * sweep) / 2, radius + 14);
    const arrow = (angle: number, forward: number) => {
      const tip = at(angle),
        tangent: Point = [
          -Math.sin(angle) * forward,
          -Math.cos(angle) * forward,
        ],
        normal: Point = [Math.cos(angle), -Math.sin(angle)];
      return `M${tip.join(" ")}L${tip[0] - tangent[0] * 7 + normal[0] * 2.5} ${tip[1] - tangent[1] * 7 + normal[1] * 2.5}L${tip[0] - tangent[0] * 7 - normal[0] * 2.5} ${tip[1] - tangent[1] * 7 - normal[1] * 2.5}Z`;
    };
    return {
      label,
      path: `M${begin.join(" ")}A${radius} ${radius} 0 ${sweep > Math.PI ? 1 : 0} ${constraint.clockwise ? 1 : 0} ${end.join(" ")}`,
      rays: `M${center.join(" ")}L${at(start, radius + 9).join(" ")}M${center.join(" ")}L${at(start + sign * sweep, radius + 9).join(" ")}`,
      arrows: arrow(start, -sign) + arrow(start + sign * sweep, sign),
    };
  };
  const instructions =
    tool === "select"
      ? "Selecciona y arrastra · Ctrl / Mayús: selección múltiple"
      : tool === "trim"
        ? "Recortar hasta más cercano: haz clic en el tramo rojo · Esc termina"
        : tool === "extend"
          ? "Extender: apunta a la mitad de la entidad y haz clic · Esc termina"
          : tool === "chamfer"
            ? "Chaflán: selecciona un vértice o dos líneas en orden A / B · Aplica desde el panel · Esc cancela"
          : tool === "fillet"
            ? "Redondeo: selecciona una o varias esquinas, o dos entidades · Aplica desde el panel · Esc termina"
          : tool === "arc"
            ? [
                "Arco: selecciona el centro",
                "Arco: selecciona el inicio",
                "Arco: selecciona el final (antihorario)",
              ][draft?.anchors.length ?? 0]
            : `${tool === "line" ? "Línea" : tool === "rectangle" ? "Rectángulo" : "Círculo"}: ${draft ? "selecciona el punto final · Esc cancela el trazo" : "arrastra o selecciona dos puntos"}`;
  const origin = screen([0, 0]);
  const baseGrid = view.scale * 10;
  const grid =
    baseGrid * 10 ** Math.max(0, Math.ceil(Math.log10(4 / baseGrid)));
  const previewShape = (() => {
    if (!draft || !hover) return null;
    const a = draft.anchors[0],
      b = draft.anchors[1],
      from = screen(coords(a)),
      to = screen(coords(hover));
    if (draft.tool === "rectangle")
      return (
        <rect
          x={Math.min(from[0], to[0])}
          y={Math.min(from[1], to[1])}
          width={Math.abs(to[0] - from[0])}
          height={Math.abs(to[1] - from[1])}
        />
      );
    if (draft.tool === "circle")
      return (
        <circle
          cx={from[0]}
          cy={from[1]}
          r={Math.hypot(to[0] - from[0], to[1] - from[1])}
        />
      );
    if (draft.tool === "arc" && b) {
      const start = screen(coords(b)),
        radius = Math.hypot(start[0] - from[0], start[1] - from[1]),
        angle = Math.atan2(hover.y - a.y, hover.x - a.x),
        startAngle = Math.atan2(b.y - a.y, b.x - a.x),
        sweep = (angle - startAngle + Math.PI * 2) % (Math.PI * 2);
      const end = [
        from[0] + radius * Math.cos(angle),
        from[1] - radius * Math.sin(angle),
      ];
      return (
        <>
          <path
            d={`M${start.join(" ")}A${radius} ${radius} 0 ${sweep > Math.PI ? 1 : 0} 0 ${end.join(" ")}`}
          />
          <path
            opacity=".4"
            d={`M${start.join(" ")}L${from.join(" ")}L${end.join(" ")}`}
          />
        </>
      );
    }
    return <line x1={from[0]} y1={from[1]} x2={to[0]} y2={to[1]} />;
  })();

  return (
    <div
      className={`sketch-canvas tool-${tool}`}
      style={{ cursor: tool === "select" ? "default" : "crosshair" }}
    >
      <svg
        ref={svg}
        tabIndex={0}
        role="application"
        aria-label="Editor de croquis multientidad"
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerCancel={cancelPointer}
        onPointerLeave={() => {
          if (!gesture.current) {
            setHover(null);
            setHovered(null);
            setTrimPreview(null);
            setExtendPreview(null);
          }
        }}
        onContextMenu={(event) => event.preventDefault()}
      >
        <defs>
          <marker
            id={`${gridId}-extend-arrow`}
            markerWidth="12"
            markerHeight="12"
            refX="11"
            refY="6"
            markerUnits="userSpaceOnUse"
            orient="auto"
          >
            <path d="M1 1L11 6L1 11Z" fill="#168b9f" />
          </marker>
          <pattern
            id={gridId}
            x={origin[0]}
            y={origin[1]}
            width={grid}
            height={grid}
            patternUnits="userSpaceOnUse"
          >
            <path
              d={`M${grid} 0H0V${grid}`}
              fill="none"
              stroke="#d7e2eb"
              strokeWidth=".7"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${gridId})`} />
        <path
          d={`M0 ${origin[1]}H${size.width}M${origin[0]} 0V${size.height}`}
          fill="none"
          stroke="#9cadbd"
          strokeWidth=".8"
        />
        <path
          data-sketch-reference="true"
          d={referenceSegments
            .map(
              ([x1, y1, x2, y2]) =>
                `M${screen([x1, y1]).join(" ")}L${screen([x2, y2]).join(" ")}`,
            )
            .join(" ")}
          fill="none"
          stroke="#778795"
          strokeWidth="1.2"
          opacity=".5"
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
          aria-hidden="true"
        />
        {displayed.entities.map((entity, index) => {
          const active = selected("entity", entity.id),
            related = relatedEntityIds.has(entity.id),
            highlighted = isHovered("entity", entity.id),
            path = entityPath(entity);
          return (
            <g
              key={entity.id}
              data-selection-kind="entity"
              data-selection-id={entity.id}
              role="button"
              aria-label={`${entity.type === "line" ? "Línea" : entity.type === "circle" ? "Círculo" : "Arco"} ${index + 1}`}
            >
              <path
                d={path}
                fill="none"
                stroke="transparent"
                strokeWidth="12"
                pointerEvents="stroke"
              />
              <path
                d={path}
                fill="none"
                stroke={
                  active
                    ? "#e78b14"
                    : highlighted
                      ? "#eaaf4d"
                      : related
                        ? "#278dbb"
                        : geometryColor
                }
                strokeWidth={active ? 2.6 : related ? 2.2 : 1.7}
                opacity={(visibleChamfer ?? visibleFillet)?.affectedEntityIds.includes(entity.id) ? 0.25 : undefined}
                strokeDasharray={entity.construction ? "7 5" : undefined}
                pointerEvents="none"
              />
            </g>
          );
        })}
        {displayed.constraints.map((constraint, index) => {
          const angular =
            constraint.type === "angle"
              ? angularDrawing(constraint, index)
              : null;
          const [x, y] =
              angular?.label ?? constraintPosition(constraint, index),
            active = selected("constraint", constraint.id),
            conflict = solution?.conflictingConstraintIds.includes(
              constraint.id,
            ),
            redundant = solution?.redundantConstraintIds.includes(
              constraint.id,
            );
          const label =
            "value" in constraint
              ? (() => {
                  const value = constraint.driven
                    ? preview
                      ? null
                      : solution?.drivenValues[constraint.id]
                    : constraint.value;
                  const text =
                    value === null || value === undefined
                      ? "—"
                      : `${constraint.type === "angle" ? angleText(value) : lengthText(value)}${constraint.type === "angle" ? "°" : ""}`;
                  return constraint.driven
                    ? `(${labels[constraint.type]}${text})`
                    : `${labels[constraint.type]}${text}`;
                })()
              : labels[constraint.type];
          const color = active
            ? "#b96500"
            : conflict
              ? "#c43332"
              : redundant
                ? "#9c680d"
                : "value" in constraint && constraint.driven
                  ? "#697580"
                  : "#4b677b";
          return (
            <g
              key={constraint.id}
              data-selection-kind="constraint"
              data-selection-id={constraint.id}
              role="button"
              aria-label={`${"value" in constraint && constraint.driven ? "Cota conducida" : "Restricción"} ${constraint.type}${"value" in constraint ? ` ${label} ${constraint.type === "angle" ? "grados" : "mm"}` : ""}`}
              pointerEvents={
                tool === "trim" || tool === "extend" || tool === "chamfer" || tool === "fillet" ? "none" : undefined
              }
            >
              {angular && (
                <>
                  <path
                    d={angular.rays}
                    fill="none"
                    stroke={color}
                    strokeWidth=".8"
                    strokeDasharray="3 3"
                    pointerEvents="none"
                  />
                  <path
                    d={angular.path}
                    fill="none"
                    stroke="transparent"
                    strokeWidth="10"
                  />
                  <path
                    d={angular.path}
                    fill="none"
                    stroke={color}
                    strokeWidth="1.1"
                    pointerEvents="none"
                  />
                  <path d={angular.arrows} fill={color} pointerEvents="none" />
                </>
              )}
              <text
                x={x}
                y={y}
                textAnchor="middle"
                fontFamily="Segoe UI, sans-serif"
                fontSize={11}
                fontWeight={active ? 700 : 400}
                fill={color}
                stroke="#f6f9fc"
                strokeWidth={4}
                paintOrder="stroke"
                style={{ cursor: "pointer" }}
              >
                {label}
              </text>
            </g>
          );
        })}
        {displayed.points.map((point) => {
          const [x, y] = screen([point.x, point.y]),
            active = selected("point", point.id);
          return (
            <g
              key={point.id}
              data-selection-kind="point"
              data-selection-id={point.id}
              role="button"
              aria-label={`Punto ${point.x.toFixed(2)}, ${point.y.toFixed(2)}`}
              pointerEvents={
                tool === "trim" || tool === "extend" ? "none" : undefined
              }
            >
              <circle cx={x} cy={y} r={7} fill="transparent" />
              <circle
                cx={x}
                cy={y}
                r={active ? 4.5 : 3}
                fill={active ? "#e78b14" : geometryColor}
                stroke="#f6f9fc"
                strokeWidth="1"
                pointerEvents="none"
              />
            </g>
          );
        })}
        <g
          data-selection-kind="point"
          data-selection-id="origin"
          role="button"
          aria-label="Origen fijo (0, 0)"
          pointerEvents={
            tool === "trim" || tool === "extend" ? "none" : undefined
          }
        >
          <circle cx={origin[0]} cy={origin[1]} r={9} fill="transparent" />
          <path
            d={`M${origin[0] - 7} ${origin[1]}h14M${origin[0]} ${origin[1] - 7}v14`}
            stroke={selected("point", "origin") ? "#e78b14" : "#ca4545"}
            strokeWidth="1.6"
            pointerEvents="none"
          />
          <circle
            cx={origin[0]}
            cy={origin[1]}
            r="2.5"
            fill="#ca4545"
            pointerEvents="none"
          />
        </g>
        {visibleFillet && (
          <g data-fillet-preview="true" pointerEvents="none" aria-label="Vista previa del redondeo">
            {visibleFillet.profile.entities
              .filter(entity => visibleFillet.affectedEntityIds.includes(entity.id) || visibleFillet.createdEntityIds.includes(entity.id))
              .map(entity => <path key={entity.id}
                data-fillet-segment={visibleFillet.createdEntityIds.includes(entity.id) ? "fillet" : visibleFillet.affectedEntityIds.includes(entity.id) ? "trimmed" : "support"}
                d={entityPath(entity, visibleFillet.profile)} fill="none" stroke="#168b9f"
                strokeWidth={entity.construction ? "1.2" : "2.7"}
                strokeDasharray={entity.construction ? "4 5" : undefined}
                opacity={entity.construction ? 0.55 : undefined} pointerEvents="none" />)}
          </g>
        )}
        {visibleChamfer && (
          <g data-chamfer-preview="true" pointerEvents="none" aria-label="Vista previa del chaflán">
            {visibleChamfer.profile.entities
              .filter(entity => visibleChamfer.affectedEntityIds.includes(entity.id) || entity.id === visibleChamfer.chamferEntityId)
              .map(entity => (
                <path
                  key={entity.id}
                  data-chamfer-segment={entity.id === visibleChamfer.chamferEntityId ? "chamfer" : "trimmed-line"}
                  d={entityPath(entity, visibleChamfer.profile)}
                  fill="none"
                  stroke="#168b9f"
                  strokeWidth="2.7"
                  strokeDasharray={entity.construction ? "7 5" : undefined}
                  pointerEvents="none"
                />
              ))}
            {visibleChamfer.profile.entities
              .filter(entity => entity.construction && visibleChamfer.createdEntityIds.includes(entity.id) && entity.id !== visibleChamfer.chamferEntityId)
              .map(entity => (
                <path
                  key={entity.id}
                  data-chamfer-construction="true"
                  d={entityPath(entity, visibleChamfer.profile)}
                  fill="none"
                  stroke="#168b9f"
                  strokeWidth="1.2"
                  strokeDasharray="4 5"
                  opacity=".55"
                  pointerEvents="none"
                />
              ))}
          </g>
        )}
        {tool === "trim" && trimPreview?.segment && (
          <path
            data-trim-preview="true"
            d={trimSegmentPath(trimPreview.segment)}
            fill="none"
            stroke="#d43a38"
            strokeWidth="4"
            opacity=".9"
            pointerEvents="none"
            aria-hidden="true"
          />
        )}
        {tool === "extend" && extendPreview?.segment && (
          <path
            data-extend-preview="true"
            d={trimSegmentPath(extendPreview.segment)}
            fill="none"
            stroke="#168b9f"
            strokeWidth="4"
            strokeDasharray="7 3"
            markerEnd={`url(#${gridId}-extend-arrow)`}
            opacity=".95"
            pointerEvents="none"
            aria-hidden="true"
          />
        )}
        <g
          fill="none"
          stroke="#2183c9"
          strokeWidth="1.5"
          strokeDasharray="6 4"
          pointerEvents="none"
        >
          {previewShape}
        </g>
        {hover?.id &&
          (() => {
            const [x, y] = screen(coords(hover));
            return (
              <rect
                x={x - 6}
                y={y - 6}
                width="12"
                height="12"
                fill="none"
                stroke="#da8a19"
                strokeWidth="1.4"
                pointerEvents="none"
              />
            );
          })()}
      </svg>
      <div
        className="sketch-caption"
        style={{
          color: message ? "#b2312f" : "#5e778c",
          whiteSpace: "normal",
          textAlign: "center",
          width: "calc(100% - 50px)",
        }}
        role="status"
      >
        <div style={{ color: geometryColor, fontWeight: 600, marginBottom: 5 }}>
          {statusText}
        </div>
        <div>
          {message ||
            trimNotice ||
            trimPreview?.message ||
            extendPreview?.message ||
            instructions}
        </div>
        <div style={{ marginTop: 5 }}>
          {plane} · Milímetros · Cuadrícula de 10 mm · Rueda: zoom · Botón
          central / derecho: desplazar
        </div>
      </div>
    </div>
  );
}
