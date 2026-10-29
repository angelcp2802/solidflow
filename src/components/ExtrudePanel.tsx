import { ChevronDown, MousePointer2, RotateCw } from "lucide-react";
import ThinWallPanel from './ThinWallPanel';
import { validateSecondDirectionDepth } from '../cad/extrusionDirection';
import { extrusionDirectionInputError } from './extrusionEditorDraft';
import { extrusionEndForSide, extrusionEndPatch, type ExtrusionSide } from './extrusionEndPicking';
import './extrude-panel.css';
import type {
  ExtrudeFeature,
  ExtrudeEndCondition,
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
  pickingSide?: ExtrusionSide | null;
  loading: boolean;
  canPickFace: boolean;
  existing?: boolean;
  thinWallRequired?: boolean;
  thinWallDisabled?: boolean;
  autoCornersAvailable?: boolean;
  endCapsAvailable?: boolean;
  directionDisabled?: boolean;
  bodyPicking?: boolean;
  onChange: (patch: Partial<ExtrudeFeature>) => void;
  onTarget: (target: PlaneSupport, side: ExtrusionSide) => void;
  onPickFace: (side: ExtrusionSide) => void;
}

/** Draft transition only; a missing explicit body limit remains invalid. */
export function extrudeModePatch(feature: ExtrudeFeature, value: string, baseFeatureId: string | null, preferredTarget: PlaneSupport): Partial<ExtrudeFeature> | null {
  return extrudeSideModePatch(feature, 'first', value, baseFeatureId, preferredTarget)
}

export function extrudeSideModePatch(feature: ExtrudeFeature, side: ExtrusionSide, value: string, baseFeatureId: string | null, preferredTarget: PlaneSupport): Partial<ExtrudeFeature> | null {
  if (side === 'second' && (!feature.secondDirection || value === 'mid' || value === 'throughAllBoth')) return null
  const end = extrusionEndForSide(feature, side)
  const patch = (next: ExtrudeEndCondition | undefined) => ({ ...extrusionEndPatch(feature, side, next), ...(side === 'first' ? { symmetric: false } : {}) })
  if (value === 'blind' || value === 'mid') return { ...patch(undefined), ...(side === 'first' ? { symmetric: value === 'mid' } : {}) }
  if (value === 'upToSurface') return {
    ...patch({ kind: 'upToSurface', target: end?.kind === 'upToSurface' ? end.target : preferredTarget }),
    ...(side === 'first' ? { depth: feature.depth } : {}),
  }
  if (!['throughAll', 'throughAllBoth', 'untilNext'].includes(value)) return null
  const explicitBody = feature.type === 'extrude' && feature.bodyOperation?.mode === 'new'
  const baseBody = explicitBody && end && 'baseFeatureId' in end ? end.baseBody : undefined
  if (!explicitBody && !baseFeatureId) return null
  const base = explicitBody ? baseBody?.sourceFeatureId ?? '' : baseFeatureId!
  const reference = baseBody ? { baseBody: { ...baseBody } } : {}
  return {
    ...patch(value === 'untilNext' ? { kind: 'untilNext', baseFeatureId: base, ...reference }
      : { kind: 'throughAll', baseFeatureId: base, bothDirections: value === 'throughAllBoth', ...reference }),
    ...(side === 'first' ? { depth: feature.depth } : {}),
  }
}

export default function ExtrudePanel({
  feature,
  features,
  planes,
  baseFeatureId,
  preferredTarget,
  picking,
  pickingSide = picking ? 'first' : null,
  loading,
  canPickFace,
  existing = false,
  thinWallRequired = false,
  thinWallDisabled = false,
  autoCornersAvailable = false,
  endCapsAvailable = false,
  directionDisabled = false,
  bodyPicking = false,
  onChange,
  onTarget,
  onPickFace,
}: Props) {
  const end = feature.endCondition;
  const direction = feature.secondDirection;
  const secondEnd = direction?.endCondition;
  const directionAvailable = feature.symmetric === false && !(end?.kind === 'throughAll' && end.bothDirections);
  const primaryControlsDisabled = loading || picking || directionDisabled;
  const directionControlsDisabled = primaryControlsDisabled || bodyPicking;
  const secondDepthDisabled = directionControlsDisabled || (!directionAvailable && !!direction?.enabled);
  const directionError = extrusionDirectionInputError(feature);
  const primaryDepthInvalid = !!extrusionDirectionInputError({ depth: feature.depth, symmetric: false });
  let secondDepthInvalid = false;
  if (direction) {
    try { validateSecondDirectionDepth(direction.depth); }
    catch { secondDepthInvalid = true; }
  }
  const mode =
    end?.kind === "throughAll" && end.bothDirections
      ? "throughAllBoth"
      : (end?.kind ?? (feature.symmetric ? "mid" : "blind"));
  const explicitBodyLimit = feature.type === 'extrude' && feature.bodyOperation?.mode === 'new';
  const targetControls = (side: ExtrusionSide, sideEnd: ExtrudeEndCondition | undefined) => {
    const target = sideEnd?.kind === 'upToSurface' ? sideEnd.target : null;
    if (!target) return null;
    const second = side === 'second';
    const targetDisabled = second ? directionControlsDisabled : primaryControlsDisabled;
    const sidePicking = pickingSide === side;
    const label = second ? 'Superficie de destino de dirección 2' : 'Superficie de destino';
    const targetValue =
    target?.kind === "principal"
      ? `principal:${target.plane}`
      : target?.kind === "plane"
        ? `plane:${target.planeId}`
        : "face";
    return <div className="property-section extrude-end-target">
      <h3><ChevronDown size={12} />{label}</h3>
      <select aria-label={label} value={targetValue} disabled={targetDisabled}
        onChange={event => {
          if (targetDisabled) return;
          const value = event.target.value;
          if (value.startsWith('principal:')) onTarget({ kind: 'principal', plane: value.slice(10) as Plane }, side);
          else if (value.startsWith('plane:')) onTarget({ kind: 'plane', planeId: value.slice(6) }, side);
        }}>
        <option value="principal:XY">Alzado (XY)</option><option value="principal:XZ">Planta (XZ)</option><option value="principal:YZ">Vista lateral (YZ)</option>
        {planes.map(plane => <option key={plane.id} value={`plane:${plane.id}`} disabled={plane.suppressed}>{plane.name}{plane.suppressed ? ' · suprimido' : ''}</option>)}
        {target.kind === 'plane' && !planes.some(plane => plane.id === target.planeId) && <option value={targetValue}>Plano no disponible</option>}
        {target.kind === 'face' && <option value="face">Cara de {features.find(item => item.id === target.face.sourceFeatureId)?.name ?? 'Referencia perdida'}</option>}
      </select>
      <button className={`outline-button ${sidePicking ? 'active' : ''}`} disabled={!canPickFace || loading || directionDisabled || bodyPicking}
        onClick={() => { if (canPickFace && !loading && !directionDisabled && !bodyPicking) onPickFace(side); }}>
        <MousePointer2 size={14} />{sidePicking ? 'Volver a vista previa' : second ? 'Seleccionar cara de destino de dirección 2' : 'Seleccionar cara de destino'}
      </button>
      <p className="muted-small">{loading ? 'Preparando la pieza anterior…' : sidePicking
        ? `Selecciona la cara de destino de dirección ${second ? '2' : '1'} en la pieza anterior.`
        : 'Puedes elegir un plano o una cara del historial. Si se pierde la referencia, vuelve a seleccionar el destino.'}</p>
    </div>;
  };
  const changeMode = (value: string) => {
    const patch = extrudeModePatch(feature, value, baseFeatureId, preferredTarget);
    if (patch && !primaryControlsDisabled) onChange(patch);
  };
  return (
    <>
      <div className="property-section">
        <h3>
          <ChevronDown size={12} /> Dirección 1
        </h3>
        <select
          aria-label="Condición final"
          disabled={primaryControlsDisabled}
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
              disabled={primaryControlsDisabled}
              aria-invalid={primaryDepthInvalid}
              aria-describedby={directionError ? 'extrusion-direction-error' : undefined}
              onChange={(event) => {
                if (primaryControlsDisabled) return;
                onChange({
                  depth:
                    event.target.value === ""
                      ? 0
                      : Number(event.target.value),
                });
              }}
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
            disabled={primaryControlsDisabled}
            onClick={() => { if (!primaryControlsDisabled) onChange({ depth: -feature.depth }); }}
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
                disabled={primaryControlsDisabled}
                onClick={() => { if (!primaryControlsDisabled) onChange({ endCondition: { ...end, baseFeatureId } }); }}
              >
                Actualizar sólido de referencia
              </button>
            )}
          </>
        )}
      </div>
      {targetControls('first', end)}
      <section className="property-section extrude-direction-two-section" aria-labelledby="extrude-direction-two-heading" aria-disabled={directionControlsDisabled}>
        <h3 id="extrude-direction-two-heading"><label className="extrude-direction-two-toggle" htmlFor="extrude-direction-two">
          <input id="extrude-direction-two" type="checkbox" aria-label="Dirección 2" checked={direction?.enabled ?? false}
            disabled={directionControlsDisabled || (!directionAvailable && !direction?.enabled)}
            onChange={event => {
              if (directionControlsDisabled || (event.target.checked && !directionAvailable)
                || (!event.target.checked && !direction?.enabled)) return;
              onChange({ secondDirection: { ...direction, enabled: event.target.checked, depth: direction?.depth ?? DEFAULT_SECOND_DIRECTION_DEPTH } });
            }} />
          Dirección 2
        </label></h3>
        {direction && <>
          <select aria-label="Condición final de dirección 2" value={secondEnd?.kind ?? 'blind'} disabled={secondDepthDisabled}
            onChange={event => {
              if (secondDepthDisabled) return;
              const patch = extrudeSideModePatch(feature, 'second', event.target.value, baseFeatureId, preferredTarget);
              if (patch) onChange(patch);
            }}>
            <option value="blind">Hasta profundidad específica</option>
            <option value="throughAll" disabled={(!baseFeatureId && !explicitBodyLimit) || loading}>Por todo</option>
            <option value="untilNext" disabled={(!baseFeatureId && !explicitBodyLimit) || loading}>Hasta siguiente</option>
            <option value="upToSurface">Hasta superficie</option>
          </select>
          <label className={`number-field${(!direction.enabled || secondEnd) && !secondDepthInvalid ? ' extrude-inactive-second-depth' : ''}`}
          htmlFor="extrude-second-depth"><span>Profundidad de dirección 2</span><div>
          <input id="extrude-second-depth" aria-label="Profundidad de dirección 2" type="number" step={1}
            value={Number.isFinite(direction.depth) ? direction.depth : ''} disabled={secondDepthDisabled}
            aria-invalid={!!directionError} aria-describedby={directionError ? 'extrusion-direction-error' : undefined}
            onChange={event => {
              if (secondDepthDisabled) return;
              onChange({ secondDirection: { ...direction, depth: event.target.value === '' ? 0 : Number(event.target.value) } });
            }} /><small>mm</small>
        </div></label>
          {secondEnd && 'baseFeatureId' in secondEnd && <>
            <p className="muted-small">Sólido de referencia de dirección 2: {features.find(item => item.id === secondEnd.baseFeatureId)?.name ?? 'Referencia perdida'}.</p>
            {!explicitBodyLimit && baseFeatureId && baseFeatureId !== secondEnd.baseFeatureId && <button className="outline-button"
              disabled={secondDepthDisabled} onClick={() => {
                if (!secondDepthDisabled) onChange(extrusionEndPatch(feature, 'second', { ...secondEnd, baseFeatureId }));
              }}>Actualizar sólido de referencia de dirección 2</button>}
          </>}
          {targetControls('second', secondEnd)}
        </>}
      </section>
      {directionError && <p id="extrusion-direction-error" className="extrude-direction-error" role="alert">{directionError}</p>}
      <ThinWallPanel thinWall={feature.thinWall} existing={existing} required={thinWallRequired} disabled={loading || thinWallDisabled}
        autoCornersAvailable={feature.type === 'extrude' && autoCornersAvailable}
        allowAutoCornerRecovery={feature.type === 'extrude'}
        endCapsAvailable={feature.type === 'extrude' && feature.symmetric === false && end === undefined && !(direction?.enabled && secondEnd) && endCapsAvailable}
        allowEndCapRecovery={true}
        onChange={thinWall => onChange({ thinWall })} />
    </>
  );
}
