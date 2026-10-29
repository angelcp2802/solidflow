import { ChevronDown, MousePointer2, RotateCw } from "lucide-react";
import ThinWallPanel from './ThinWallPanel';
import { validateSecondDirection } from '../cad/extrusionDirection';
import { extrusionDirectionInputError } from './extrusionEditorDraft';
import './extrude-panel.css';
import type {
  ExtrudeFeature,
  Feature,
  Plane,
  PlaneSupport,
  ReferencePlaneFeature,
} from "../cad/kernel.types";

const DEFAULT_SECOND_DIRECTION_DEPTH = 10;

interface Props {
  feature: ExtrudeFeature;
  features: Feature[];
  planes: ReferencePlaneFeature[];
  baseFeatureId: string | null;
  preferredTarget: PlaneSupport;
  picking: boolean;
  loading: boolean;
  canPickFace: boolean;
  existing?: boolean;
  thinWallRequired?: boolean;
  thinWallDisabled?: boolean;
  autoCornersAvailable?: boolean;
  endCapsAvailable?: boolean;
  directionDisabled?: boolean;
  onChange: (patch: Partial<ExtrudeFeature>) => void;
  onTarget: (target: PlaneSupport) => void;
  onPickFace: () => void;
}

/** Draft transition only; a missing explicit body limit remains invalid. */
export function extrudeModePatch(feature: ExtrudeFeature, value: string, baseFeatureId: string | null, preferredTarget: PlaneSupport): Partial<ExtrudeFeature> | null {
  const end = feature.endCondition
  if (value === 'blind' || value === 'mid') return { endCondition: undefined, symmetric: value === 'mid' }
  if (value === 'upToSurface') return {
    endCondition: { kind: 'upToSurface', target: end?.kind === 'upToSurface' ? end.target : preferredTarget },
    symmetric: false, depth: feature.depth,
  }
  if (!['throughAll', 'throughAllBoth', 'untilNext'].includes(value)) return null
  const explicitBody = feature.type === 'extrude' && feature.bodyOperation?.mode === 'new'
  const baseBody = explicitBody && end && 'baseFeatureId' in end ? end.baseBody : undefined
  if (!explicitBody && !baseFeatureId) return null
  const base = explicitBody ? baseBody?.sourceFeatureId ?? '' : baseFeatureId!
  const reference = baseBody ? { baseBody: { ...baseBody } } : {}
  return {
    endCondition: value === 'untilNext' ? { kind: 'untilNext', baseFeatureId: base, ...reference }
      : { kind: 'throughAll', baseFeatureId: base, bothDirections: value === 'throughAllBoth', ...reference },
    symmetric: false, depth: feature.depth,
  }
}

export default function ExtrudePanel({
  feature,
  features,
  planes,
  baseFeatureId,
  preferredTarget,
  picking,
  loading,
  canPickFace,
  existing = false,
  thinWallRequired = false,
  thinWallDisabled = false,
  autoCornersAvailable = false,
  endCapsAvailable = false,
  directionDisabled = false,
  onChange,
  onTarget,
  onPickFace,
}: Props) {
  const end = feature.endCondition;
  const direction = feature.secondDirection;
  const directionAvailable = feature.symmetric === false && end === undefined;
  const directionControlsDisabled = loading || picking || directionDisabled;
  const secondDepthDisabled = directionControlsDisabled || (!directionAvailable && !!direction?.enabled);
  const directionError = extrusionDirectionInputError(feature);
  const primaryDepthInvalid = !!extrusionDirectionInputError({ depth: feature.depth, symmetric: false });
  let secondDepthInvalid = false;
  if (direction) {
    try { validateSecondDirection(direction); }
    catch { secondDepthInvalid = true; }
  }
  const mode =
    end?.kind === "throughAll" && end.bothDirections
      ? "throughAllBoth"
      : (end?.kind ?? (feature.symmetric ? "mid" : "blind"));
  const target = end?.kind === "upToSurface" ? end.target : null;
  const explicitBodyLimit = feature.type === 'extrude' && feature.bodyOperation?.mode === 'new';
  const targetValue =
    target?.kind === "principal"
      ? `principal:${target.plane}`
      : target?.kind === "plane"
        ? `plane:${target.planeId}`
        : "face";
  const changeMode = (value: string) => {
    const patch = extrudeModePatch(feature, value, baseFeatureId, preferredTarget);
    if (patch) onChange(patch);
  };
  return (
    <>
      <div className="property-section">
        <h3>
          <ChevronDown size={12} /> Dirección 1
        </h3>
        <select
          aria-label="Condición final"
          value={mode}
          onChange={(event) => changeMode(event.target.value)}
        >
          <option value="blind">Hasta profundidad específica</option>
          <option value="mid">Plano medio</option>
          <option value="throughAll" disabled={(!baseFeatureId && !explicitBodyLimit) || loading}>
            Por todo
          </option>
          <option value="throughAllBoth" disabled={(!baseFeatureId && !explicitBodyLimit) || loading}>
            Por todo · ambos sentidos
          </option>
          <option value="untilNext" disabled={(!baseFeatureId && !explicitBodyLimit) || loading}>
            Hasta siguiente
          </option>
          <option value="upToSurface">Hasta superficie</option>
        </select>
        <label className={`number-field${end && !primaryDepthInvalid ? ' extrude-inactive-primary-depth' : ''}`} htmlFor="extrude-primary-depth">
          <span>Profundidad</span>
          <div>
            <input
              id="extrude-primary-depth"
              aria-label="Profundidad"
              type="number"
              step={1}
              value={Number.isFinite(feature.depth) ? feature.depth : ""}
              aria-invalid={primaryDepthInvalid}
              aria-describedby={directionError ? 'extrusion-direction-error' : undefined}
              onChange={(event) =>
                onChange({
                  depth:
                    event.target.value === ""
                      ? 0
                      : Number(event.target.value),
                })
              }
            />
            <small>mm</small>
          </div>
        </label>
        {end && (
          <p className="muted-small">
            {mode === "throughAllBoth"
              ? "Atraviesa la pieza a ambos lados del croquis."
              : mode === "throughAll"
                ? "Atraviesa la pieza en el sentido seleccionado. La longitud se adapta al reconstruir."
                : mode === "untilNext"
                  ? "Termina en la siguiente superficie que cubra todo el perfil."
                  : "El extremo sigue la superficie elegida al reconstruir la pieza."}
          </p>
        )}
        {mode !== "throughAllBoth" && (
          <button
            className={`outline-button ${feature.depth < 0 ? "active" : ""}`}
            aria-pressed={feature.depth < 0}
            onClick={() => onChange({ depth: -feature.depth })}
          >
            <RotateCw size={14} /> Invertir dirección
          </button>
        )}
        {end && "baseFeatureId" in end && (
          <>
            <p className="muted-small">
              Sólido de referencia:{" "}
              {features.find((item) => item.id === end.baseFeatureId)?.name ??
                "Referencia perdida"}
              .
            </p>
            {!explicitBodyLimit && baseFeatureId && baseFeatureId !== end.baseFeatureId && (
              <button
                className="outline-button"
                disabled={loading}
                onClick={() =>
                  onChange({ endCondition: { ...end, baseFeatureId } })
                }
              >
                Actualizar sólido de referencia
              </button>
            )}
          </>
        )}
      </div>
      {target && (
        <div className="property-section">
          <h3>
            <ChevronDown size={12} /> Superficie de destino
          </h3>
          <select
            aria-label="Superficie de destino"
            value={targetValue}
            onChange={(event) => {
              const value = event.target.value;
              if (value.startsWith("principal:"))
                onTarget({
                  kind: "principal",
                  plane: value.slice(10) as Plane,
                });
              else if (value.startsWith("plane:"))
                onTarget({ kind: "plane", planeId: value.slice(6) });
            }}
          >
            <option value="principal:XY">Alzado (XY)</option>
            <option value="principal:XZ">Planta (XZ)</option>
            <option value="principal:YZ">Vista lateral (YZ)</option>
            {planes.map((plane) => (
              <option
                key={plane.id}
                value={`plane:${plane.id}`}
                disabled={plane.suppressed}
              >
                {plane.name}
                {plane.suppressed ? " · suprimido" : ""}
              </option>
            ))}
            {target.kind === "plane" &&
              !planes.some((plane) => plane.id === target.planeId) && (
                <option value={targetValue}>Plano no disponible</option>
              )}
            {target.kind === "face" && (
              <option value="face">
                Cara de{" "}
                {features.find(
                  (item) => item.id === target.face.sourceFeatureId,
                )?.name ?? "Referencia perdida"}
              </option>
            )}
          </select>
          <button
            className={`outline-button ${picking ? "active" : ""}`}
            disabled={!canPickFace}
            onClick={onPickFace}
          >
            <MousePointer2 size={14} />
            {picking ? "Volver a vista previa" : "Seleccionar cara de destino"}
          </button>
          <p className="muted-small">
            {loading
              ? "Preparando la pieza anterior…"
              : picking
                ? "Selecciona una cara plana o curva de la pieza anterior."
                : "Puedes elegir un plano o una cara del historial. Si se pierde la referencia, vuelve a seleccionar el destino."}
          </p>
        </div>
      )}
      <section className="property-section extrude-direction-two-section" aria-labelledby="extrude-direction-two-heading" aria-disabled={directionControlsDisabled}>
        <h3 id="extrude-direction-two-heading"><label className="extrude-direction-two-toggle" htmlFor="extrude-direction-two">
          <input id="extrude-direction-two" type="checkbox" aria-label="Dirección 2" checked={direction?.enabled ?? false}
            disabled={directionControlsDisabled || (!directionAvailable && !direction?.enabled)}
            onChange={event => {
              if (directionControlsDisabled || (event.target.checked && !directionAvailable)
                || (!event.target.checked && !direction?.enabled)) return;
              onChange({ secondDirection: { enabled: event.target.checked, depth: direction?.depth ?? DEFAULT_SECOND_DIRECTION_DEPTH } });
            }} />
          Dirección 2
        </label></h3>
        {direction && <label className={`number-field${!direction.enabled && !secondDepthInvalid ? ' extrude-inactive-second-depth' : ''}`}
          htmlFor="extrude-second-depth"><span>Profundidad de dirección 2</span><div>
          <input id="extrude-second-depth" aria-label="Profundidad de dirección 2" type="number" step={1}
            value={Number.isFinite(direction.depth) ? direction.depth : ''} disabled={secondDepthDisabled}
            aria-invalid={!!directionError} aria-describedby={directionError ? 'extrusion-direction-error' : undefined}
            onChange={event => {
              if (secondDepthDisabled) return;
              onChange({ secondDirection: { ...direction, depth: event.target.value === '' ? 0 : Number(event.target.value) } });
            }} /><small>mm</small>
        </div></label>}
      </section>
      {directionError && <p id="extrusion-direction-error" className="extrude-direction-error" role="alert">{directionError}</p>}
      <ThinWallPanel thinWall={feature.thinWall} existing={existing} required={thinWallRequired} disabled={loading || thinWallDisabled}
        autoCornersAvailable={feature.type === 'extrude' && autoCornersAvailable}
        allowAutoCornerRecovery={feature.type === 'extrude'}
        endCapsAvailable={feature.type === 'extrude' && feature.symmetric === false && end === undefined && endCapsAvailable}
        allowEndCapRecovery={true}
        onChange={thinWall => onChange({ thinWall })} />
    </>
  );
}
