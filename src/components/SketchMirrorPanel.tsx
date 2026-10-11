import { useEffect, useMemo, useRef, useState } from "react";
import { FlipHorizontal2, X } from "lucide-react";
import { mirrorAxisPointIds, planSketchMirror, type MirrorPlan } from "../sketch/mirror";
import type { EntityProfile, SketchSelection, SketchSolveResult } from "../sketch/types";

interface Props {
  profile: EntityProfile;
  solution: SketchSolveResult | null;
  selection: SketchSelection[];
  axisEntityId: string;
  pickingAxis: boolean;
  onAxisChange: (id: string) => void;
  onPickAxis: () => void;
  onSelection: (selection: SketchSelection[]) => void;
  onPreview: (plan: MirrorPlan | null) => void;
  onApply: (plan: MirrorPlan) => void;
  onCancel: () => void;
}

export default function SketchMirrorPanel({ profile, solution, selection, axisEntityId, pickingAxis,
  onAxisChange, onPickAxis, onSelection, onPreview, onApply, onCancel }: Props) {
  const [shareAxisPoints, setShareAxisPoints] = useState(true);
  const callback = useRef(onPreview);
  callback.current = onPreview;
  const healthy = solution?.status === "fullyDefined" || solution?.status === "underdefined";
  const resolved = healthy && solution ? solution.profile : profile;
  const plan = useMemo(() => healthy && axisEntityId && selection.length
    ? planSketchMirror(resolved, selection, { axisEntityId,
        joinPointIds: shareAxisPoints ? mirrorAxisPointIds(resolved, selection.filter(s => s.kind === "entity").map(s => s.id), axisEntityId) : [],
      }) : null,
  [healthy, resolved, selection, axisEntityId, shareAxisPoints]);
  const applicable = plan?.changed ? plan : null;
  useEffect(() => { callback.current(applicable); return () => callback.current(null); }, [applicable]);
  const label = (id: string) => {
    const index = resolved.entities.findIndex(e => e.id === id), entity = resolved.entities[index];
    return entity ? `${entity.type === "line" ? "Línea" : entity.type === "arc" ? "Arco" : "Círculo"} ${index + 1}${entity.construction ? " · construcción" : ""}` : "Entidad no disponible";
  };
  return <div className="property-section trim-property mirror-property">
    <h3><FlipHorizontal2 size={14} /> Simetría de croquis</h3>
    <p>Selecciona las entidades que quieres copiar y una línea como eje. Las copias siguen los cambios de las fuentes y del eje.</p>
    <label><span>Con respecto a</span>
      <select aria-label="Eje de simetría" value={axisEntityId} onChange={event => onAxisChange(event.target.value)}>
        <option value="">Selecciona una línea</option>
        {resolved.entities.filter(e => e.type === "line").map(e => <option value={e.id} key={e.id}>{label(e.id)}</option>)}
      </select>
    </label>
    <button type="button" className="outline-button" aria-pressed={pickingAxis} onClick={onPickAxis}>
      {pickingAxis ? "Selecciona el eje en el croquis…" : "Seleccionar eje en el croquis"}
    </button>
    <div aria-label="Entidades para simetría">
      {selection.map(item => <div className="sketch-selection-actions" key={`${item.kind}:${item.id}`}>
        <span>{label(item.id)}</span>
        <button type="button" aria-label={`Quitar ${label(item.id)}`} onClick={() => onSelection(selection.filter(s => s.id !== item.id))}><X size={13} /></button>
      </div>)}
    </div>
    <button type="button" disabled={!selection.length} onClick={() => onSelection([])}>Limpiar entidades</button>
    <label className="checkbox-field"><input type="checkbox" checked={shareAxisPoints} onChange={event => { callback.current(null); setShareAxisPoints(event.target.checked); }} />Compartir puntos fuente sobre el eje</label>
    <p className="muted-small">Compartir mantiene unidos los extremos del medio perfil. El eje de construcción no forma parte del contorno sólido.</p>
    {!healthy ? <p role="alert">Resuelve un croquis válido antes de reflejar entidades.</p>
      : plan && !plan.changed ? <p role="alert">{plan.message}</p> : null}
    <p aria-live="polite" aria-atomic="true">{applicable ? `${applicable.imageEntityIds.length} copias · ${applicable.joinedPointIds.length} puntos compartidos. Las relaciones se guardan con el croquis.`
      : !axisEntityId ? "Elige el eje de simetría." : "Selecciona las entidades para ver la simetría."}</p>
    <button type="button" className="outline-button" aria-label="Aplicar simetría" disabled={!applicable} onClick={() => { if (applicable) onApply(applicable); }}>Aplicar simetría</button>
    <button type="button" className="outline-button" onClick={onCancel}>Terminar simetría · Esc</button>
  </div>;
}
