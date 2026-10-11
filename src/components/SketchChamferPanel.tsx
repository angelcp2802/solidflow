import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Triangle, X } from "lucide-react";
import {
  planSketchChamfer,
  type ChamferParameters,
  type ChamferPlan,
} from "../sketch/chamfer";
import { SKETCH_LIMITS } from "../sketch/validation";
import type {
  EntityProfile,
  SketchSelection,
  SketchSolveResult,
} from "../sketch/types";

interface Props {
  profile: EntityProfile;
  solution: SketchSolveResult | null;
  selection: SketchSelection[];
  onSelection: (selection: SketchSelection[]) => void;
  onApply: (plan: ChamferPlan) => void;
  onCancel: () => void;
  onPreview: (plan: ChamferPlan | null) => void;
}

function decimal(text: string): number | null {
  const normalized = text.trim().replace(",", ".");
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(normalized))
    return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

const validDistance = (value: number | null): value is number =>
  value !== null &&
  value >= SKETCH_LIMITS.minDimension &&
  value <= SKETCH_LIMITS.maxDimension;
const validAngle = (value: number | null): value is number =>
  value !== null && value > 0 && value < 180;

export default function SketchChamferPanel({
  profile,
  solution,
  selection,
  onSelection,
  onApply,
  onCancel,
  onPreview,
}: Props) {
  const [mode, setMode] = useState<ChamferParameters["mode"]>("equal");
  const [distance1, setDistance1] = useState("2");
  const [distance2, setDistance2] = useState("3");
  const [angle, setAngle] = useState("45");
  const errorId = useId();
  const previewCallback = useRef(onPreview);
  previewCallback.current = onPreview;
  const healthy =
    solution?.status === "underdefined" || solution?.status === "fullyDefined";
  const resolvedProfile = useMemo(
    () => (healthy && solution ? solution.profile : profile),
    [healthy, solution, profile],
  );
  const parsed = useMemo((): {
    parameters: ChamferParameters | null;
    error: string | null;
  } => {
    const first = decimal(distance1);
    const second = decimal(distance2);
    const degrees = decimal(angle);
    if (!validDistance(first) || (mode === "distances" && !validDistance(second)))
      return {
        parameters: null,
        error: `Introduce distancias entre ${SKETCH_LIMITS.minDimension} y ${SKETCH_LIMITS.maxDimension} mm. Se admite coma decimal.`,
      };
    if (mode === "angle" && !validAngle(degrees))
      return {
        parameters: null,
        error: "Introduce un ángulo mayor que 0° y menor que 180°. Debe caber en la esquina seleccionada.",
      };
    return {
      parameters:
        mode === "equal"
          ? { mode, distance: first }
          : mode === "distances"
            ? { mode, distance1: first, distance2: second! }
            : { mode, distance: first, angle: degrees! },
      error: null,
    };
  }, [mode, distance1, distance2, angle]);
  const planning = useMemo(() => {
    if (!healthy || !parsed.parameters) return { plan: null, error: null };
    try {
      return {
        plan: planSketchChamfer(resolvedProfile, selection, parsed.parameters),
        error: null,
      };
    } catch (error) {
      return {
        plan: null,
        error: error instanceof Error ? error.message : "No se puede preparar el chaflán.",
      };
    }
  }, [healthy, parsed.parameters, resolvedProfile, selection]);
  const plan = planning.plan?.changed ? planning.plan : null;
  const error =
    parsed.error ??
    (!healthy
      ? "Resuelve un croquis válido antes de aplicar el chaflán."
      : planning.error ?? (planning.plan?.changed ? null : planning.plan?.message));
  useEffect(() => {
    previewCallback.current(plan);
    return () => previewCallback.current(null);
  }, [plan]);

  const orderedIds = plan
    ? plan.affectedEntityIds
    : selection.filter(item => item.kind === "entity").map(item => item.id);
  const lineName = (id: string) => {
    const index = resolvedProfile.entities.findIndex(entity => entity.id === id);
    return index < 0 ? "Línea no disponible" : `Línea ${index + 1}`;
  };
  const numericField = (
    label: string,
    value: string,
    change: (value: string) => void,
    unit: string,
    valid: boolean,
  ) => (
    <label className="number-field">
      <span>{label}</span>
      <div>
        <input
          type="text"
          inputMode="decimal"
          aria-label={label}
          aria-invalid={!valid || undefined}
          aria-describedby={!valid ? errorId : undefined}
          value={value}
          onChange={event => change(event.target.value)}
        />
        <small>{unit}</small>
      </div>
    </label>
  );
  return (
    <div className="property-section trim-property chamfer-property">
      <h3><Triangle size={14} /> Chaflán de croquis</h3>
      <p>Selecciona un vértice de dos líneas adyacentes, o selecciona primero la línea A y después la B. Puedes usar Ctrl / Mayús.</p>
      <p>Se admite una esquina entre dos líneas. Arcos, círculos y esquinas sin extremo común quedan fuera de esta herramienta.</p>
      <label>
        <span>Tipo de chaflán</span>
        <select
          aria-label="Tipo de chaflán"
          value={mode}
          onChange={event => setMode(event.target.value as ChamferParameters["mode"])}
        >
          <option value="equal">Distancias iguales</option>
          <option value="distances">Dos distancias</option>
          <option value="angle">Distancia y ángulo</option>
        </select>
      </label>
      {numericField(
        mode === "equal" ? "Distancia en A y B" : "Distancia A (D1)",
        distance1, setDistance1, "mm", validDistance(decimal(distance1)),
      )}
      {mode === "distances" && numericField(
        "Distancia B (D2)", distance2, setDistance2, "mm", validDistance(decimal(distance2)),
      )}
      {mode === "angle" && numericField(
        "Ángulo desde A hacia B", angle, setAngle, "°", validAngle(decimal(angle)),
      )}
      <p className="muted-small">Las distancias se miden desde la esquina original sobre cada línea. En modo ángulo, D1 corresponde a A y el ángulo parte de A hacia B.</p>
      <div aria-label="Orden de las líneas del chaflán">
        {orderedIds.slice(0, 2).map((id, index) => (
          <div className="sketch-selection-actions" key={id}>
            <span>{index === 0 ? "A · D1" : "B · D2"}: {lineName(id)}</span>
            <button
              type="button"
              aria-label={`Quitar línea ${index === 0 ? "A" : "B"}`}
              onClick={() => onSelection(orderedIds.filter(item => item !== id).map(item => ({ kind: "entity", id: item })))}
            ><X size={13} /></button>
          </div>
        ))}
        {selection.length === 1 && selection[0].kind === "point" && (
          <p className="muted-small">Vértice seleccionado{selection[0].id === "origin" ? " · origen" : ""}. El orden A/B aparece en la vista previa.</p>
        )}
      </div>
      <div className="sketch-selection-actions">
        <button
          type="button"
          disabled={orderedIds.length !== 2}
          onClick={() => onSelection([...orderedIds].reverse().map(id => ({ kind: "entity", id })))}
        >Invertir A / B</button>
        <button type="button" disabled={!selection.length} onClick={() => onSelection([])}>Limpiar selección</button>
      </div>
      {error && <p id={errorId} role="alert">{error}</p>}
      <p aria-live="polite" aria-atomic="true">
        {plan ? "Vista previa preparada. Aplica el chaflán para confirmar la geometría mostrada." : "Sin vista previa aplicable."}
      </p>
      <button
        type="button"
        className="outline-button"
        aria-label="Aplicar chaflán"
        disabled={!plan}
        onClick={() => { if (plan) onApply(plan); }}
      >Aplicar chaflán</button>
      <button type="button" className="outline-button" onClick={onCancel}>Cancelar · Esc</button>
    </div>
  );
}
