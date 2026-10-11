import { ChevronDown, Eye, MapPin, Plus, RotateCw, Trash2 } from "lucide-react";
import type {
  Feature,
  HoleFeature,
  HoleHead,
  PlaneSupport,
  ReferencePlaneFeature,
} from "../cad/kernel.types";
import PlaneSupportPanel from "./PlaneSupportPanel";

export type HoleSection = "type" | "positions";
interface Props {
  feature: HoleFeature;
  features: Feature[];
  planes: ReferencePlaneFeature[];
  section: HoleSection;
  onSection: (section: HoleSection) => void;
  onChange: (patch: Partial<HoleFeature>) => void;
  onSupport: (support: PlaneSupport) => void;
  picking: boolean;
  canPickFace: boolean;
  onPickFace: () => void;
  selectedPosition: string | null;
  onSelectPosition: (id: string | null) => void;
  baseFeatureId: string | null;
  loading: boolean;
}
function Dimension({
  label,
  value,
  onChange,
  unit = "mm",
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  unit?: string;
}) {
  return (
    <label className="number-field">
      <span>{label}</span>
      <div>
        <input
          type="number"
          step="0.5"
          aria-label={label}
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
export default function HolePanel({
  feature,
  features,
  planes,
  section,
  onSection,
  onChange,
  onSupport,
  picking,
  canPickFace,
  onPickFace,
  selectedPosition,
  onSelectPosition,
  baseFeatureId,
  loading,
}: Props) {
  const end = feature.endCondition;
  const setHead = (kind: HoleHead["kind"]) => {
    const diameter = Math.max(
      1,
      Number.isFinite(feature.diameter) ? feature.diameter : 8,
    );
    onChange({
      head:
        kind === "simple"
          ? { kind }
          : kind === "counterbore"
            ? { kind, diameter: diameter * 1.8, depth: 3 }
            : { kind, diameter: diameter * 1.8, angle: 90 },
    });
  };
  const position = feature.positions.find(
    (item) => item.id === selectedPosition,
  );
  const addPosition = () => {
    const last = feature.positions.at(-1);
    const next = {
      id: crypto.randomUUID(),
      x: last ? Math.min(1e6, last.x + Math.max(10, feature.diameter * 2)) : 0,
      y: last?.y ?? 0,
    };
    onChange({ positions: [...feature.positions, next] });
    onSelectPosition(next.id);
  };
  return (
    <>
      <div
        className="hole-tabs"
        role="tablist"
        aria-label="Asistente para taladro"
      >
        <button
          role="tab"
          aria-selected={section === "type"}
          onClick={() => onSection("type")}
        >
          Tipo
        </button>
        <button
          role="tab"
          aria-selected={section === "positions"}
          onClick={() => onSection("positions")}
        >
          Posiciones ({feature.positions.length})
        </button>
      </div>
      {section === "type" ? (
        <>
          <div className="property-section">
            <h3>
              <ChevronDown size={12} /> Tipo de taladro
            </h3>
            <select
              aria-label="Tipo de taladro"
              value={feature.head.kind}
              onChange={(event) =>
                setHead(event.target.value as HoleHead["kind"])
              }
            >
              <option value="simple">Taladro</option>
              <option value="counterbore">Refrentado</option>
              <option value="countersink">Avellanado</option>
            </select>
            <p className="muted-small">
              Tamaño personalizado · Dimensiones en milímetros.
            </p>
            <Dimension
              label="Diámetro del taladro"
              value={feature.diameter}
              onChange={(diameter) => onChange({ diameter })}
            />
            {feature.head.kind !== "simple" && (
              <Dimension
                label={
                  feature.head.kind === "counterbore"
                    ? "Diámetro del refrentado"
                    : "Diámetro del avellanado"
                }
                value={feature.head.diameter}
                onChange={(diameter) =>
                  onChange({ head: { ...feature.head, diameter } as HoleHead })
                }
              />
            )}
            {feature.head.kind === "counterbore" && (
              <Dimension
                label="Profundidad del refrentado"
                value={feature.head.depth}
                onChange={(depth) =>
                  onChange({ head: { ...feature.head, depth } as HoleHead })
                }
              />
            )}
            {feature.head.kind === "countersink" && (
              <Dimension
                label="Ángulo del avellanado"
                value={feature.head.angle}
                unit="°"
                onChange={(angle) =>
                  onChange({ head: { ...feature.head, angle } as HoleHead })
                }
              />
            )}
          </div>
          <div className="property-section">
            <h3>
              <ChevronDown size={12} /> Condición final
            </h3>
            <select
              aria-label="Condición final del taladro"
              value={end.kind}
              onChange={(event) =>
                onChange({
                  endCondition:
                    event.target.value === "blind"
                      ? {
                          kind: "blind",
                          depth: 15,
                          depthReference: "shoulder",
                          tip: { kind: "conical", angle: 118 },
                        }
                      : {
                          kind: event.target.value as
                            "throughAll" | "untilNext",
                        },
                })
              }
            >
              <option value="blind">Hasta profundidad específica</option>
              <option value="throughAll">Por todo</option>
              <option value="untilNext">Hasta siguiente</option>
            </select>
            {end.kind === "blind" && (
              <>
                <Dimension
                  label="Profundidad del taladro"
                  value={end.depth}
                  onChange={(depth) =>
                    onChange({ endCondition: { ...end, depth } })
                  }
                />
                <select
                  aria-label="Fondo del taladro"
                  value={end.tip.kind}
                  onChange={(event) =>
                    onChange({
                      endCondition: {
                        ...end,
                        tip:
                          event.target.value === "flat"
                            ? { kind: "flat" }
                            : { kind: "conical", angle: 118 },
                      },
                    })
                  }
                >
                  <option value="conical">Punta de broca</option>
                  <option value="flat">Fondo plano</option>
                </select>
                {end.tip.kind === "conical" && (
                  <>
                    <Dimension
                      label="Ángulo de la punta"
                      value={end.tip.angle}
                      unit="°"
                      onChange={(angle) =>
                        onChange({
                          endCondition: {
                            ...end,
                            tip: { kind: "conical", angle },
                          },
                        })
                      }
                    />
                    <select
                      aria-label="Referencia de profundidad"
                      value={end.depthReference}
                      onChange={(event) =>
                        onChange({
                          endCondition: {
                            ...end,
                            depthReference: event.target.value as
                              "shoulder" | "tip",
                          },
                        })
                      }
                    >
                      <option value="shoulder">Profundidad hasta hombro</option>
                      <option value="tip">Profundidad hasta punta</option>
                    </select>
                    <p className="muted-small">
                      {end.depthReference === "shoulder"
                        ? "La punta cónica se añade a la profundidad cilíndrica indicada."
                        : "La profundidad indicada incluye la punta cónica."}
                    </p>
                  </>
                )}
              </>
            )}
            {end.kind !== "blind" && (
              <p className="muted-small">
                {end.kind === "throughAll"
                  ? "Atraviesa el material en el sentido elegido. El alcance se adapta a la pieza."
                  : "Cada centro termina al atravesar su primera pared completa."}
              </p>
            )}
            <button
              className={`outline-button ${feature.reversed ? "active" : ""}`}
              aria-pressed={feature.reversed}
              onClick={() => onChange({ reversed: !feature.reversed })}
            >
              <RotateCw size={14} /> Invertir dirección del taladro
            </button>
            <p className="muted-small">
              El sentido inicial entra en la cara seleccionada. Los ángulos son
              los ángulos completos del cono.
            </p>
          </div>
          <div className="property-section">
            <button
              className="outline-button"
              onClick={() => onSection("positions")}
            >
              <MapPin size={14} /> Colocar centros
            </button>
            <p className="muted-small">
              {feature.positions.length} posición(es). Define los centros sobre
              un plano o una cara plana.
            </p>
          </div>
        </>
      ) : (
        <>
          <PlaneSupportPanel
            support={feature.support}
            features={features}
            planes={planes}
            onChange={onSupport}
            onPickFace={onPickFace}
            canPickFace={canPickFace}
            picking={picking}
          />
          <div className="property-section">
            <h3>
              <ChevronDown size={12} /> Centros ({feature.positions.length})
            </h3>
            <p className="muted-small">
              Pulsa sobre el plano para añadir posiciones. Selecciona un centro
              para editar sus coordenadas locales.
            </p>
            <div
              className="hole-position-list"
              role="list"
              aria-label="Centros del taladro"
            >
              {feature.positions.map((item, index) => (
                <div key={item.id} role="listitem">
                  <button
                    className={item.id === selectedPosition ? "active" : ""}
                    onClick={() => onSelectPosition(item.id)}
                    aria-pressed={item.id === selectedPosition}
                  >
                    Centro {index + 1}
                    <small>
                      X {item.x.toFixed(2)} · Y {item.y.toFixed(2)}
                    </small>
                  </button>
                  <button
                    aria-label={`Eliminar centro ${index + 1}`}
                    onClick={() => {
                      onChange({
                        positions: feature.positions.filter(
                          (other) => other.id !== item.id,
                        ),
                      });
                      if (item.id === selectedPosition) onSelectPosition(null);
                    }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
            {position && (
              <>
                <Dimension
                  label="Centro del taladro X"
                  value={position.x}
                  onChange={(x) =>
                    onChange({
                      positions: feature.positions.map((item) =>
                        item.id === position.id ? { ...item, x } : item,
                      ),
                    })
                  }
                />
                <Dimension
                  label="Centro del taladro Y"
                  value={position.y}
                  onChange={(y) =>
                    onChange({
                      positions: feature.positions.map((item) =>
                        item.id === position.id ? { ...item, y } : item,
                      ),
                    })
                  }
                />
              </>
            )}
            <button
              className="outline-button"
              disabled={feature.positions.length >= 128 || picking}
              onClick={addPosition}
            >
              <Plus size={14} /> Añadir centro por coordenadas
            </button>
            <button
              className="outline-button"
              onClick={() => onSection("type")}
            >
              <Eye size={14} /> Vista previa del taladro
            </button>
          </div>
        </>
      )}
      <div className="property-section">
        <p className="muted-small">
          Sólido de referencia:{" "}
          {features.find((item) => item.id === feature.baseFeatureId)?.name ??
            "Referencia perdida"}
          .
        </p>
        {baseFeatureId && baseFeatureId !== feature.baseFeatureId && (
          <button
            className="outline-button"
            disabled={loading}
            onClick={() => onChange({ baseFeatureId })}
          >
            Actualizar sólido de referencia
          </button>
        )}
      </div>
    </>
  );
}
