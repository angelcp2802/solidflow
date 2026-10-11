import { useEffect, useId, useMemo, useRef, useState } from "react";
import { CopyPlus, X } from "lucide-react";
import { planSketchOffset, type OffsetParameters, type OffsetPlan } from "../sketch/offset";
import { SKETCH_LIMITS } from "../sketch/validation";
import type { EntityProfile, SketchSelection, SketchSolveResult } from "../sketch/types";

interface Props {
  profile: EntityProfile;
  solution: SketchSolveResult | null;
  selection: SketchSelection[];
  onSelection: (selection: SketchSelection[]) => void;
  onPreview: (plan: OffsetPlan | null) => void;
  onApply: (plan: OffsetPlan) => void;
  onCancel: () => void;
}

export default function SketchOffsetPanel({ profile, solution, selection, onSelection, onPreview, onApply, onCancel }: Props) {
  const [distance, setDistance] = useState("1");
  const [reverse, setReverse] = useState(false);
  const [bothDirections, setBothDirections] = useState(false);
  const [chain, setChain] = useState(true);
  const [cap, setCap] = useState<OffsetParameters["cap"]>("none");
  const [construction, setConstruction] = useState<OffsetParameters["construction"]>("none");
  const [addDimensions, setAddDimensions] = useState(true);
  const errorId = useId();
  const callback = useRef(onPreview);
  callback.current = onPreview;
  const healthy = solution?.status === "fullyDefined" || solution?.status === "underdefined";
  const resolved = healthy && solution ? solution.profile : profile;
  const normalized = distance.trim().replace(",", ".");
  const parsed = /^[+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(normalized) ? Number(normalized) : NaN;
  const validDistance = Number.isFinite(parsed) && parsed >= SKETCH_LIMITS.minDimension && parsed <= SKETCH_LIMITS.maxDimension;
  const plan = useMemo(() => healthy && validDistance
    ? planSketchOffset(resolved, selection, { distance: parsed, reverse, bothDirections, chain, cap, construction, addDimensions }) : null,
  [healthy, validDistance, resolved, selection, parsed, reverse, bothDirections, chain, cap, construction, addDimensions]);
  const applicable = plan?.changed ? plan : null;
  useEffect(() => { callback.current(applicable); return () => callback.current(null); }, [applicable]);
  const invalidate = () => callback.current(null);
  const label = (id: string) => {
    const index = resolved.entities.findIndex(entity => entity.id === id), entity = resolved.entities[index];
    return entity ? `${entity.type === "line" ? "Línea" : entity.type === "arc" ? "Arco" : "Círculo"} ${index + 1}` : "Entidad no disponible";
  };
  const error = !validDistance ? `Introduce una distancia entre ${SKETCH_LIMITS.minDimension} y ${SKETCH_LIMITS.maxDimension} mm. Se admite coma decimal.`
    : !healthy ? "Resuelve un croquis válido antes de crear la equidistancia."
    : plan && !plan.changed && selection.length ? plan.message : null;
  return <div className="property-section trim-property offset-property">
    <h3><CopyPlus size={14} /> Equidistancia de entidades</h3>
    <p>Selecciona líneas, arcos o círculos. La vista previa muestra las copias y sus cierres antes de modificar el croquis.</p>
    <div aria-label="Entidades para equidistancia">
      {selection.map(item => <div className="sketch-selection-actions" key={`${item.kind}:${item.id}`}>
        <span>{label(item.id)}</span>
        <button type="button" aria-label={`Quitar ${label(item.id)}`} onClick={() => { invalidate(); onSelection(selection.filter(s => s.id !== item.id)); }}><X size={13} /></button>
      </div>)}
    </div>
    <button type="button" disabled={!selection.length} onClick={() => { invalidate(); onSelection([]); }}>Limpiar entidades</button>
    <label className="number-field"><span>Distancia</span><div>
      <input type="text" inputMode="decimal" aria-label="Distancia de equidistancia" aria-invalid={!validDistance || undefined}
        aria-describedby={error ? errorId : undefined} value={distance} onChange={event => { invalidate(); setDistance(event.target.value); }} />
      <small>mm</small>
    </div></label>
    <label className="checkbox-field"><input type="checkbox" checked={reverse} disabled={bothDirections}
      onChange={event => { invalidate(); setReverse(event.target.checked); }} />Invertir dirección</label>
    <label className="checkbox-field"><input type="checkbox" checked={bothDirections}
      onChange={event => { invalidate(); setBothDirections(event.target.checked); }} />Ambas direcciones</label>
    <label className="checkbox-field"><input type="checkbox" checked={chain}
      onChange={event => { invalidate(); setChain(event.target.checked); }} />Seleccionar cadena conectada</label>
    <label><span>Cierre de extremos</span><select aria-label="Cierre de extremos" value={cap} onChange={event => { invalidate(); setCap(event.target.value as OffsetParameters["cap"]); }}>
      <option value="none">Sin cierre</option><option value="line">Líneas</option><option value="arc">Arcos</option>
    </select></label>
    <label><span>Geometría de construcción</span><select aria-label="Geometría de construcción" value={construction}
      onChange={event => { invalidate(); setConstruction(event.target.value as OffsetParameters["construction"]); }}>
      <option value="none">Ninguna</option><option value="source">Entidades originales</option><option value="offset">Copias equidistantes</option><option value="both">Originales y copias</option>
    </select></label>
    <label className="checkbox-field"><input type="checkbox" checked={addDimensions}
      onChange={event => { invalidate(); setAddDimensions(event.target.checked); }} />Añadir cota de distancia</label>
    {error && <p id={errorId} role="alert">{error}</p>}
    <p aria-live="polite" aria-atomic="true">{applicable
      ? `${applicable.sourceEntityIds.length} entidades fuente · ${applicable.imageEntityIds.length} copias · ${applicable.capEntityIds.length} cierres. Las relaciones se guardan con el croquis.`
      : "Selecciona las entidades para ver la equidistancia."}</p>
    <button type="button" className="outline-button" aria-label="Aplicar equidistancia" disabled={!applicable}
      onClick={() => { if (applicable) onApply(applicable); }}>Aplicar equidistancia</button>
    <button type="button" className="outline-button" onClick={onCancel}>Terminar equidistancia · Esc</button>
  </div>;
}
