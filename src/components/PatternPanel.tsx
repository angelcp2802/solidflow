import { ChevronDown, RotateCw, Trash2 } from "lucide-react";
import type {
  Feature,
  LinearPatternDirection,
  PatternSource,
  Plane,
  ReferencePlaneFeature,
  RepetitionFeature,
  Vec3,
} from "../cad/kernel.types";
import { supportLabel } from "./PlaneSupportPanel";
import BodyPatternPanel, { type BodyPatternEditor } from "./BodyPatternPanel";
import FeaturePatternPanel from "./FeaturePatternPanel";
import { withFeaturePatternSeeds } from "../model/featurePatternCommands";

interface Props {
  feature: RepetitionFeature;
  features: Feature[];
  planes: ReferencePlaneFeature[];
  onChange: (patch: Partial<Feature>) => void;
  onPickFace: () => void;
  pickingFace: boolean;
  canPickFace: boolean;
  bodyEditor?: BodyPatternEditor;
  onSourceKindChange?: (mode: 'bodies' | 'features') => void;
}

function ValueField({
  label,
  value,
  unit = "mm",
  onChange,
  step = 1,
}: {
  label: string;
  value: number;
  unit?: string;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="number-field">
      <span>{label}</span>
      <div>
        <input
          aria-label={label}
          type="number"
          step={step}
          value={Number.isFinite(value) ? value : ""}
          onChange={(event) =>
            onChange(event.target.value === "" ? 0 : Number(event.target.value))
          }
        />
        <small>{unit}</small>
      </div>
    </label>
  );
}

function VectorField({
  label,
  value,
  onChange,
  direction = true,
}: {
  label: string;
  value: Vec3;
  onChange: (vector: Vec3) => void;
  direction?: boolean;
}) {
  const axis = ["X", "Y", "Z"].findIndex((_, index) =>
    value.every((component, i) =>
      i === index ? component !== 0 : component === 0,
    ),
  );
  return (
    <div className="pattern-vector">
      {direction && (
        <div className="pattern-direction-presets">
          <select
            aria-label={label}
            value={axis < 0 ? "custom" : String(axis)}
            onChange={(event) => {
              if (event.target.value !== "custom")
                onChange(
                  [0, 1, 2].map((index) =>
                    index === Number(event.target.value) ? 1 : 0,
                  ) as Vec3,
                );
            }}
          >
            <option value="0">Eje X</option>
            <option value="1">Eje Y</option>
            <option value="2">Eje Z</option>
            <option value="custom" disabled>Vector personalizado</option>
          </select>
          <button
            title={`Invertir ${label.toLowerCase()}`}
            aria-label={`Invertir ${label.toLowerCase()}`}
            onClick={() =>
              onChange(value.map((component) => -component) as Vec3)
            }
          >
            <RotateCw size={14} />
          </button>
        </div>
      )}
      <div className="pattern-vector-components">
        {["X", "Y", "Z"].map((coordinate, index) => (
          <label key={coordinate}>
            <span>{coordinate}</span>
            <input
              aria-label={`${label} ${coordinate}`}
              type="number"
              step={direction ? 0.1 : 1}
              value={Number.isFinite(value[index]) ? value[index] : ""}
              onChange={(event) => {
                const next: Vec3 = [...value];
                next[index] =
                  event.target.value === "" ? 0 : Number(event.target.value);
                onChange(next);
              }}
            />
          </label>
        ))}
      </div>
    </div>
  );
}

function DirectionFields({
  index,
  value,
  onChange,
}: {
  index: number;
  value: LinearPatternDirection;
  onChange: (value: LinearPatternDirection) => void;
}) {
  return (
    <>
      <VectorField
        label={`Dirección ${index}`}
        value={value.direction}
        onChange={(direction) => onChange({ ...value, direction })}
      />
      <ValueField
        label={`Separación en dirección ${index}`}
        value={value.spacing}
        onChange={(spacing) => onChange({ ...value, spacing })}
      />
      <ValueField
        label={`Instancias en dirección ${index}`}
        value={value.count}
        unit=""
        onChange={(count) => onChange({ ...value, count })}
      />
    </>
  );
}

export default function PatternPanel({
  feature,
  features,
  planes,
  onChange,
  onPickFace,
  pickingFace,
  canPickFace,
  bodyEditor,
  onSourceKindChange,
}: Props) {
  const solids = features.filter(
    (candidate) => candidate.type !== "sketch" && candidate.type !== "plane",
  );
  const setSource = (source: PatternSource) => {
    const scoped = feature.featurePattern && source.mode === 'features'
      ? withFeaturePatternSeeds(feature, source.featureIds) : null;
    onChange({ source, ...(scoped ? { featurePattern: scoped.featurePattern } : {}),
      ...(feature.type === 'mirror' && source.mode === 'features' ? { mergeBodies: false } : {}) });
  };
  const checkedIds =
    feature.source.mode === "features" ? feature.source.featureIds : [];
  const firstAvailable =
    solids.find((candidate) => !candidate.suppressed)?.id ??
    feature.baseFeatureId;
  const count = (value: number) =>
    Number.isInteger(value) && value >= 1 && value <= 256 ? value : 0;
  const addresses: [number, number][] = [];
  if (feature.type === "linearPattern") {
    const firstCount = count(feature.first.count),
      secondCount = feature.second ? count(feature.second.count) : 1;
    if (
      firstCount &&
      secondCount &&
      (feature.secondSeedOnly
        ? firstCount + secondCount - 1
        : firstCount * secondCount) <= 256
    ) {
      for (let j = 0; j < secondCount; j++)
        for (let i = 0; i < firstCount; i++) {
          if ((i || j) && (!feature.secondSeedOnly || j === 0 || i === 0))
            addresses.push([i, j]);
        }
    }
  }
  return (
    <>
      {bodyEditor && onSourceKindChange && <div className="property-section">
        <h3>Elementos de la repetición</h3>
        <select aria-label="Tipo de repetición en cuerpos" value={feature.source.mode === 'bodies' ? 'bodies' : 'features'}
          disabled={bodyEditor.existing || bodyEditor.loading}
          onChange={event => onSourceKindChange(event.target.value as 'bodies' | 'features')}>
          <option value="bodies">Cuerpos completos</option>
          <option value="features">Operaciones · geometría</option>
        </select>
      </div>}
      {feature.source.mode === 'bodies' ? (bodyEditor && <BodyPatternPanel feature={feature} features={features} editor={bodyEditor} onChange={onChange} />) : <div className="property-section">
        <h3>
          <ChevronDown size={12} /> Elementos a repetir
        </h3>
        {!feature.featurePattern && <select
          aria-label="Tipo de elementos a repetir"
          value={feature.source.mode}
          onChange={(event) => {
            if (event.target.value === "features")
              setSource({
                mode: "features",
                geometryPattern: true,
                featureIds: [
                  feature.source.mode === "body"
                    ? feature.source.sourceFeatureId
                    : firstAvailable,
                ],
              });
            else
              setSource({
                mode: "body",
                sourceFeatureId: feature.baseFeatureId,
              });
          }}
        >
          <option value="features">Operaciones · geometría</option>
          <option value="body">Cuerpo completo</option>
        </select>}
        {feature.source.mode === "features" ? (
          <>
            <div
              className="pattern-feature-list"
              aria-label="Operaciones para repetir"
            >
              {solids.map((candidate) => (
                <label key={candidate.id} className="check-option">
                  <input
                    type="checkbox"
                    aria-label={`Repetir ${candidate.name}`}
                    checked={checkedIds.includes(candidate.id)}
                    disabled={
                      candidate.suppressed && !checkedIds.includes(candidate.id)
                    }
                    onChange={(event) => {
                      const ids = event.target.checked
                        ? [...checkedIds, candidate.id]
                        : checkedIds.filter((id) => id !== candidate.id);
                      setSource({
                        mode: "features",
                        geometryPattern: true,
                        featureIds: ids,
                      });
                    }}
                  />
                  <span>
                    {candidate.name}
                    {candidate.suppressed ? " · suprimida" : ""}
                  </span>
                </label>
              ))}
              {checkedIds
                .filter(
                  (id) => !solids.some((candidate) => candidate.id === id),
                )
                .map((id) => (
                  <label key={id} className="check-option">
                    <input
                      type="checkbox"
                      checked
                      aria-label={`Quitar referencia perdida ${id}`}
                      onChange={() =>
                        setSource({
                          mode: "features",
                          geometryPattern: true,
                          featureIds: checkedIds.filter(
                            (candidate) => candidate !== id,
                          ),
                        })
                      }
                    />
                    Referencia perdida
                  </label>
                ))}
            </div>
            <p className="muted-small">
              Repite el material añadido o retirado por las operaciones
              seleccionadas, en el orden del historial. Conserva su geometría;
              las condiciones finales no se recalculan.
            </p>
          </>
        ) : (
          <>
            <select
              aria-label="Cuerpo en el paso del historial"
              value={feature.source.sourceFeatureId}
              onChange={(event) =>
                setSource({ mode: "body", sourceFeatureId: event.target.value })
              }
            >
              {!solids.some(
                (candidate) =>
                  candidate.id ===
                  (feature.source.mode === "body" &&
                    feature.source.sourceFeatureId),
              ) && (
                <option value={feature.source.sourceFeatureId}>
                  Referencia perdida
                </option>
              )}
              {solids.map((candidate) => (
                <option
                  key={candidate.id}
                  value={candidate.id}
                  disabled={candidate.suppressed}
                >
                  {candidate.name}
                  {candidate.suppressed ? " · suprimida" : ""}
                </option>
              ))}
            </select>
            <p className="muted-small">
              Copia el sólido completo tal como estaba en ese paso del
              historial. Ese resultado debe contener un único cuerpo.
            </p>
          </>
        )}
      </div>}
      {feature.featurePattern && bodyEditor && <FeaturePatternPanel feature={feature} features={features} editor={bodyEditor} onChange={onChange} />}
      {feature.type === "linearPattern" ? (
        <>
          <div className="property-section">
            <h3>
              <ChevronDown size={12} /> Dirección 1
            </h3>
            <DirectionFields
              index={1}
              value={feature.first}
              onChange={(first) => onChange({ first })}
            />
          </div>
          <div className="property-section">
            <h3>
              <ChevronDown size={12} /> Dirección 2
            </h3>
            <label className="check-option">
              <input
                type="checkbox"
                checked={!!feature.second}
                onChange={(event) =>
                  onChange({
                    second: event.target.checked
                      ? { direction: [0, 1, 0], spacing: 20, count: 2 }
                      : null,
                  })
                }
              />
              Segunda dirección
            </label>
            {feature.second && (
              <>
                <DirectionFields
                  index={2}
                  value={feature.second}
                  onChange={(second) => onChange({ second })}
                />
                <label className="check-option">
                  <input
                    type="checkbox"
                    checked={feature.secondSeedOnly}
                    onChange={(event) =>
                      onChange({ secondSeedOnly: event.target.checked })
                    }
                  />
                  Sólo la semilla en dirección 2
                </label>
              </>
            )}
          </div>
          <div className="property-section">
            <h3>
              <ChevronDown size={12} /> Instancias
            </h3>
            <p className="muted-small">
              El número incluye la semilla (1, 1). Las direcciones se expresan
              en los ejes globales.
            </p>
            <details>
              <summary>
                Instancias para omitir ({feature.skipped.length})
              </summary>
              <div className="pattern-instance-grid">
                {addresses.map(([i, j]) => {
                  const checked = feature.skipped.some(
                    ([x, y]) => x === i && y === j,
                  );
                  return (
                    <label key={`${i}:${j}`}>
                      <input
                        type="checkbox"
                        aria-label={`Omitir instancia ${i + 1}, ${j + 1}`}
                        checked={checked}
                        onChange={(event) =>
                          onChange({
                            skipped: event.target.checked
                              ? [...feature.skipped, [i, j]]
                              : feature.skipped.filter(
                                  ([x, y]) => x !== i || y !== j,
                                ),
                          })
                        }
                      />
                      {i + 1}, {j + 1}
                    </label>
                  );
                })}
              </div>
              {feature.skipped
                .filter(
                  ([i, j]) => !addresses.some(([x, y]) => x === i && y === j),
                )
                .map(([i, j]) => (
                  <p className="muted-small" key={`${i}:${j}`}>
                    Omisión fuera de rango: {i + 1}, {j + 1}
                  </p>
                ))}
            </details>
            <button
              className="outline-button"
              disabled={!feature.skipped.length}
              onClick={() => onChange({ skipped: [] })}
            >
              <Trash2 size={14} />
              Restablecer todas las instancias
            </button>
          </div>
        </>
      ) : feature.type === "circularPattern" ? (
        <>
          <div className="property-section">
            <h3>
              <ChevronDown size={12} /> Eje de la matriz
            </h3>
            <VectorField
              label="Dirección del eje"
              value={feature.axis.direction}
              onChange={(direction) =>
                onChange({ axis: { ...feature.axis, direction } })
              }
            />
            <h4>Un punto del eje (mm)</h4>
            <VectorField
              label="Origen del eje"
              value={feature.axis.origin}
              direction={false}
              onChange={(origin) =>
                onChange({ axis: { ...feature.axis, origin } })
              }
            />
          </div>
          <div className="property-section">
            <h3>
              <ChevronDown size={12} /> Distribución angular
            </h3>
            <ValueField
              label="Instancias circulares"
              value={feature.count}
              unit=""
              onChange={(count) => onChange({ count })}
            />
            <label className="check-option">
              <input
                type="checkbox"
                checked={feature.equalSpacing}
                onChange={(event) =>
                  onChange({ equalSpacing: event.target.checked })
                }
              />
              Separación igual
            </label>
            <ValueField
              label={
                feature.equalSpacing
                  ? "Ángulo total"
                  : "Ángulo entre instancias"
              }
              value={feature.angle}
              unit="°"
              onChange={(angle) => onChange({ angle })}
            />
            <label className="check-option">
              <input
                type="checkbox"
                checked={feature.reversed}
                onChange={(event) =>
                  onChange({ reversed: event.target.checked })
                }
              />
              Invertir sentido angular
            </label>
            <p className="muted-small">
              La cantidad incluye la semilla. Una vuelta completa con separación
              igual reparte las instancias sin duplicar el inicio.
            </p>
            <details>
              <summary>
                Instancias para omitir ({feature.skipped.length})
              </summary>
              <div className="pattern-instance-grid">
                {Array.from(
                  { length: Math.max(0, count(feature.count) - 1) },
                  (_, index) => index + 1,
                ).map((index) => (
                  <label key={index}>
                    <input
                      type="checkbox"
                      aria-label={`Omitir instancia ${index + 1}`}
                      checked={feature.skipped.includes(index)}
                      onChange={(event) =>
                        onChange({
                          skipped: event.target.checked
                            ? [...feature.skipped, index]
                            : feature.skipped.filter(
                                (value) => value !== index,
                              ),
                        })
                      }
                    />
                    {index + 1}
                  </label>
                ))}
              </div>
              {feature.skipped
                .filter((index) => index >= feature.count || index < 1)
                .map((index) => (
                  <p className="muted-small" key={index}>
                    Omisión fuera de rango: {index + 1}
                  </p>
                ))}
            </details>
            <button
              className="outline-button"
              disabled={!feature.skipped.length}
              onClick={() => onChange({ skipped: [] })}
            >
              <Trash2 size={14} />
              Restablecer todas las instancias
            </button>
          </div>
        </>
      ) : (
        <div className="property-section">
          <h3>
            <ChevronDown size={12} /> Plano de simetría
          </h3>
          <select
            aria-label="Plano de simetría"
            value={
              feature.support.kind === "principal"
                ? `principal:${feature.support.plane}`
                : feature.support.kind === "plane"
                  ? `plane:${feature.support.planeId}`
                  : "face"
            }
            onChange={(event) => {
              const value = event.target.value;
              if (value.startsWith("principal:"))
                onChange({
                  support: {
                    kind: "principal",
                    plane: value.slice(10) as Plane,
                  },
                });
              else if (value.startsWith("plane:"))
                onChange({
                  support: { kind: "plane", planeId: value.slice(6) },
                });
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
            {feature.support.kind === "plane" &&
              !planes.some(
                (plane) =>
                  plane.id ===
                  (feature.support.kind === "plane" && feature.support.planeId),
              ) && (
                <option value={`plane:${feature.support.planeId}`}>
                  Plano no disponible
                </option>
              )}
            {feature.support.kind === "face" && (
              <option value="face">
                {supportLabel(feature.support, features)}
              </option>
            )}
          </select>
          <button
            className={`outline-button ${pickingFace ? "active" : ""}`}
            disabled={!canPickFace}
            onClick={onPickFace}
          >
            {pickingFace
              ? "Volver a la vista previa"
              : "Seleccionar cara plana de simetría"}
          </button>
          <p className="muted-small">
            Usa un plano principal, un plano de referencia o una cara plana del
            sólido anterior. La referencia se actualiza al editar su soporte.
          </p>
          {feature.source.mode === "body" && (
            <label className="check-option">
              <input
                type="checkbox"
                checked={feature.mergeBodies}
                onChange={(event) =>
                  onChange({ mergeBodies: event.target.checked })
                }
              />
              Fusionar cuerpos reflejados
            </label>
          )}
        </div>
      )}
    </>
  );
}
