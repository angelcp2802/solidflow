import { useEffect, useId, useMemo, useRef, useState } from "react";
import { CornerDownRight, X } from "lucide-react";
import { planSketchFillet, type FilletParameters, type FilletPlan } from "../sketch/fillet";
import { measureEntity } from "../sketch/editing";
import { SKETCH_LIMITS } from "../sketch/validation";
import type { EntityProfile, SketchSelection, SketchSolveResult } from "../sketch/types";

interface Props {
  profile: EntityProfile;
  solution: SketchSolveResult | null;
  selection: SketchSelection[];
  previousFilletId: string | null;
  onSelection: (selection: SketchSelection[]) => void;
  onApply: (plan: FilletPlan) => void;
  onCancel: () => void;
  onPreview: (plan: FilletPlan | null) => void;
}
function decimal(text: string): number | null {
  const normalized = text.trim().replace(",", ".");
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}
const validRadius = (value: number | null): value is number => value !== null &&
  value >= SKETCH_LIMITS.minDimension && value <= SKETCH_LIMITS.maxDimension;

export default function SketchFilletPanel({
  profile, solution, selection, previousFilletId, onSelection, onApply, onCancel, onPreview,
}: Props) {
  const [radius, setRadius] = useState("2");
  const [cornerPolicy, setCornerPolicy] = useState<FilletParameters["cornerPolicy"]>("keep");
  const [reference, setReference] = useState("previous");
  const [choice, setChoice] = useState<{ selectionKey: string; index: number } | null>(null);
  const selectionKey = selection.map(item => `${item.kind}:${item.id}`).join("|");
  const solutionIndex = choice?.selectionKey === selectionKey ? choice.index : undefined;
  const setSolutionIndex = (index: number | undefined) => setChoice(index === undefined ? null : { selectionKey, index });
  const errorId = useId();
  const previewCallback = useRef(onPreview);
  previewCallback.current = onPreview;
  const healthy = solution?.status === "underdefined" || solution?.status === "fullyDefined";
  const resolved = healthy && solution ? solution.profile : profile;
  const selectedEntities = selection.filter(item => item.kind === "entity").map(item => item.id);
  const completeSelection = (selection.length === 1 && selection[0].kind === "point") ||
    (selection.length === 2 && selectedEntities.length === 2);
  const circular = resolved.entities.filter(entity => entity.type !== "line" && !selectedEntities.includes(entity.id));
  const requestedReferenceId = reference === "previous" ? previousFilletId : reference === "independent" ? null : reference;
  const referenceEntity = circular.find(entity => entity.id === requestedReferenceId);
  const referenceRadius = referenceEntity ? measureEntity(resolved, referenceEntity) : null;
  const typedRadius = decimal(radius);
  const effectiveRadius = referenceEntity ? referenceRadius : typedRadius;
  const parameters = useMemo((): FilletParameters | null => {
    if (!validRadius(effectiveRadius)) return null;
    if (requestedReferenceId && !referenceEntity) return null;
    return {
      radius: effectiveRadius, cornerPolicy, solutionIndex,
      ...(referenceEntity ? { equalRadiusEntityId: referenceEntity.id } : {}),
    };
  }, [effectiveRadius, cornerPolicy, solutionIndex, requestedReferenceId, referenceEntity]);
  const planning = useMemo(() => healthy && parameters && completeSelection
    ? planSketchFillet(resolved, selection, parameters) : null,
  [healthy, parameters, completeSelection, resolved, selection]);
  const plan = planning?.changed ? planning : null;
  useEffect(() => {
    if (plan && solutionIndex === undefined && plan.selectedSolutionIndex !== null)
      setChoice({ selectionKey, index: plan.selectedSolutionIndex });
  }, [plan, solutionIndex, selectionKey]);
  const error = !healthy ? "Resuelve un croquis válido antes de redondearlo."
    : requestedReferenceId && !referenceEntity ? "El radio de referencia ya no está disponible. Elige un radio individual."
    : !parameters ? `Introduce un radio entre ${SKETCH_LIMITS.minDimension} y ${SKETCH_LIMITS.maxDimension} mm. Se admite coma decimal.`
    : planning && !planning.changed ? planning.message : null;
  useEffect(() => {
    previewCallback.current(plan);
    return () => previewCallback.current(null);
  }, [plan]);
  const entityName = (id: string) => {
    const index = resolved.entities.findIndex(entity => entity.id === id);
    const entity = resolved.entities[index];
    return entity ? `${entity.type === "line" ? "Línea" : entity.type === "arc" ? "Arco" : "Círculo"} ${index + 1}` : "Entidad no disponible";
  };
  const orderedIds = plan?.affectedEntityIds ?? selectedEntities;
  return <div className="property-section trim-property fillet-property">
    <h3><CornerDownRight size={14} /> Redondeo de croquis</h3>
    <p>Selecciona una esquina o dos entidades. Las líneas y los arcos se recortan o prolongan hasta los contactos tangentes de la vista previa.</p>
    <label className="number-field">
      <span>Radio del redondeo</span>
      <div>
        <input type="text" inputMode="decimal" aria-label="Radio del redondeo"
          value={referenceEntity ? String(referenceRadius ?? "") : radius} disabled={!!referenceEntity}
          aria-invalid={!referenceEntity && !validRadius(typedRadius) || undefined}
          aria-describedby={!referenceEntity && !validRadius(typedRadius) ? errorId : undefined}
          onChange={event => setRadius(event.target.value)} />
        <small>mm</small>
      </div>
    </label>
    <label>
      <span>Relación de radios</span>
      <select aria-label="Relación de radios" value={reference} onChange={event => setReference(event.target.value)}>
        <option value="previous">Enlazar redondeos consecutivos</option>
        <option value="independent">Cota de radio individual</option>
        {circular.map(entity => <option key={entity.id} value={entity.id}>Igual a {entityName(entity.id)}</option>)}
      </select>
    </label>
    {referenceEntity ? <p className="muted-small">Radio enlazado: {referenceRadius?.toLocaleString("es-ES", { maximumFractionDigits: 6 })} mm. La relación de igualdad mantiene ambos radios al editar sus cotas.</p>
      : reference === "previous" && <p className="muted-small">El primer redondeo lleva una cota. Los siguientes se enlazan con el anterior durante esta sesión de herramienta.</p>}
    <label>
      <span>Esquina original</span>
      <select aria-label="Esquina original" value={cornerPolicy} onChange={event => setCornerPolicy(event.target.value as FilletParameters["cornerPolicy"])}>
        <option value="keep">Mantener esquina y cotas</option>
        <option value="delete">Eliminar restricciones de la esquina</option>
      </select>
    </label>
    <p className="muted-small">Mantener conserva una esquina común y sus cotas. En parejas separadas con arcos, ambos modos retiran los extremos sustituidos y sus restricciones exclusivas. Los puntos usados por otras entidades se conservan.</p>
    <div aria-label="Entidades del redondeo">
      {orderedIds.slice(0, 2).map((id, index) => <div className="sketch-selection-actions" key={id}>
        <span>{index === 0 ? "A" : "B"}: {entityName(id)}</span>
        <button type="button" aria-label={`Quitar entidad ${index === 0 ? "A" : "B"}`}
          onClick={() => { setSolutionIndex(undefined); onSelection(orderedIds.filter(item => item !== id).map(item => ({ kind: "entity", id: item }))); }}><X size={13} /></button>
      </div>)}
      {selection.length === 1 && selection[0].kind === "point" && <p className="muted-small">Vértice seleccionado{selection[0].id === "origin" ? " · origen" : ""}.</p>}
    </div>
    <button type="button" disabled={!selection.length} onClick={() => { setSolutionIndex(undefined); onSelection([]); }}>Limpiar selección</button>
    {!!planning?.candidates.length && <label>
      <span>Solución geométrica</span>
      <select aria-label="Solución geométrica" value={planning.selectedSolutionIndex ?? ""}
        onChange={event => setSolutionIndex(Number(event.target.value))}>
        {planning.selectedSolutionIndex === null && <option value="" disabled>Elige una solución disponible</option>}
        {planning.candidates.map(candidate => <option key={candidate.index} value={candidate.index}>{candidate.label}</option>)}
      </select>
    </label>}
    {plan && <>
      <ul className="muted-small" aria-label="Cambios en los tramos">
        {plan.sourceEdits.map(edit => <li key={edit.entityId}>
          {orderedIds.indexOf(edit.entityId) === 0 ? "A" : "B"} · {entityName(edit.entityId)}: {edit.movement === "none"
            ? "conserva la posición del extremo."
            : `${edit.movement === "extend" ? "prolonga" : "recorta"} ${edit.amount.toLocaleString("es-ES", { maximumFractionDigits: 6 })} mm.`}
        </li>)}
      </ul>
      <p className="muted-small" aria-label="Cambios en las restricciones">
        {plan.convertedConstraintIds.length} cotas convertidas · {plan.deletedConstraintIds.length} restricciones eliminadas · {plan.createdConstraintIds.length} nuevas.
      </p>
    </>}
    {error && <p id={errorId} role="alert">{error}</p>}
    <p aria-live="polite" aria-atomic="true">{plan ? plan.message : !completeSelection ? "Selecciona un vértice o completa la selección de dos entidades." : "Sin vista previa aplicable."}</p>
    <button type="button" className="outline-button" aria-label="Aplicar redondeo" disabled={!plan} onClick={() => { if (plan) onApply(plan); }}>Aplicar redondeo</button>
    <button type="button" className="outline-button" onClick={onCancel}>Terminar redondeo · Esc</button>
  </div>;
}
