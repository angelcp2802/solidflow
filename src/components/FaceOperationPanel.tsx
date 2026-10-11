import { ChevronDown, Info, MousePointer2, Trash2, X } from "lucide-react";
import type {
  FaceOperationFeature,
  FaceReference,
  Feature,
  Plane,
  PlaneSupport,
  ReferencePlaneFeature,
} from "../cad/kernel.types";
import { supportLabel } from "./PlaneSupportPanel";

export function sameFace(a: FaceReference, b: FaceReference) {
  return a.sourceFeatureId === b.sourceFeatureId && a.key === b.key;
}

interface Props {
  feature: FaceOperationFeature;
  features: Feature[];
  planes: ReferencePlaneFeature[];
  onChange: (patch: Partial<Feature>) => void;
  onSupport: (support: PlaneSupport) => void;
  onPickSupport: () => void;
  pickingSupport: boolean;
  canPickSupport: boolean;
  preview: boolean;
  onPreview: (preview: boolean) => void;
  canPreview: boolean;
  loading: boolean;
}

export default function FaceOperationPanel({
  feature,
  features,
  planes,
  onChange,
  onSupport,
  onPickSupport,
  pickingSupport,
  canPickSupport,
  preview,
  onPreview,
  canPreview,
  loading,
}: Props) {
  const faces = feature.type === "shell" ? feature.removedFaces : feature.faces;
  const updateFaces = (next: FaceReference[]) => {
    onChange(
      feature.type === "shell" ? { removedFaces: next } : { faces: next },
    );
  };
  const neutral = feature.type === "draft" ? feature.support : null;
  const supportValue =
    neutral?.kind === "principal"
      ? `principal:${neutral.plane}`
      : neutral?.kind === "plane"
        ? `plane:${neutral.planeId}`
        : "face";
  return (
    <>
      {feature.type === "draft" && neutral && (
        <div className="property-section">
          <h3>
            <ChevronDown size={12} /> Plano neutro
          </h3>
          <select
            aria-label="Plano neutro"
            value={supportValue}
            onChange={(event) => {
              const value = event.target.value;
              if (value.startsWith("principal:"))
                onSupport({
                  kind: "principal",
                  plane: value.slice(10) as Plane,
                });
              else if (value.startsWith("plane:"))
                onSupport({ kind: "plane", planeId: value.slice(6) });
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
            {neutral.kind === "plane" &&
              !planes.some((plane) => plane.id === neutral.planeId) && (
                <option value={supportValue}>Plano no disponible</option>
              )}
            {neutral.kind === "face" && (
              <option value="face">{supportLabel(neutral, features)}</option>
            )}
          </select>
          <button
            className={`outline-button ${pickingSupport ? "active" : ""}`}
            onClick={onPickSupport}
            disabled={!canPickSupport}
          >
            <MousePointer2 size={14} />{" "}
            {pickingSupport
              ? "Volver a seleccionar caras"
              : "Seleccionar cara como plano neutro"}
          </button>
          <p className="muted-small">
            La sección que coincide con el plano neutro conserva sus
            dimensiones. El ángulo sigue la normal del plano.
          </p>
        </div>
      )}
      <div className="property-section">
        <h3>
          <ChevronDown size={12} />{" "}
          {feature.type === "shell" ? "Caras a eliminar" : "Caras a inclinar"}
        </h3>
        <div className="edge-selection-header">
          <span>Caras seleccionadas ({faces.length})</span>
          <button
            title="Vaciar selección de caras"
            aria-label="Vaciar selección de caras"
            disabled={!faces.length}
            onClick={() => updateFaces([])}
          >
            <Trash2 size={13} />
          </button>
        </div>
        <ul className="edge-selection-list" aria-label="Caras de la operación">
          {faces.map((face, index) => (
            <li key={face.sourceFeatureId + face.key}>
              <span>Cara {index + 1}</span>
              <button
                title={`Quitar cara ${index + 1}`}
                aria-label={`Quitar cara ${index + 1}`}
                onClick={() =>
                  updateFaces(faces.filter((item) => !sameFace(item, face)))
                }
              >
                <X size={13} />
              </button>
            </li>
          ))}
          {!faces.length && (
            <li className="selection-placeholder">
              {feature.type === "shell"
                ? "Sin caras eliminadas: cavidad cerrada."
                : "Selecciona las caras que quieres inclinar."}
            </li>
          )}
        </ul>
        <div
          className="finish-view-switch"
          aria-label="Vista de la operación de caras"
        >
          <button
            className={!preview && !pickingSupport ? "active" : ""}
            disabled={loading}
            onClick={() => onPreview(false)}
          >
            Seleccionar caras
          </button>
          <button
            className={preview && !pickingSupport ? "active" : ""}
            disabled={!canPreview}
            onClick={() => onPreview(true)}
          >
            Vista previa
          </button>
        </div>
        <p className="muted-small">
          {loading
            ? "Preparando el sólido anterior…"
            : pickingSupport
              ? "Selecciona una cara plana como plano neutro."
              : preview
                ? "La vista muestra el resultado de la operación."
                : "Haz clic en las caras del sólido anterior para añadirlas o quitarlas. Gira la pieza para acceder a otras caras."}
        </p>
      </div>
      <div className="property-section">
        <h3>
          <ChevronDown size={12} />{" "}
          {feature.type === "shell" ? "Espesor" : "Ángulo de desmoldeo"}
        </h3>
        <label className="number-field">
          <span>
            {feature.type === "shell" ? "Espesor uniforme" : "Ángulo"}
          </span>
          <div>
            <input
              type="number"
              aria-label={
                feature.type === "shell"
                  ? "Espesor del vaciado"
                  : "Ángulo de desmoldeo"
              }
              min={0.01}
              max={feature.type === "shell" ? 100000 : 89.9}
              step={feature.type === "shell" ? 0.5 : 1}
              value={
                feature.type === "shell" ? feature.thickness : feature.angle
              }
              onChange={(event) =>
                onChange(
                  feature.type === "shell"
                    ? { thickness: Number(event.target.value) }
                    : { angle: Number(event.target.value) },
                )
              }
            />
            <small>{feature.type === "shell" ? "mm" : "°"}</small>
          </div>
        </label>
        {feature.type === "shell" ? (
          <label className="finish-checkbox">
            <input
              type="checkbox"
              checked={feature.direction === "outward"}
              onChange={(event) =>
                onChange({
                  direction: event.target.checked ? "outward" : "inward",
                })
              }
            />{" "}
            Vaciado hacia fuera
          </label>
        ) : (
          <>
            <label className="finish-checkbox">
              <input
                type="checkbox"
                checked={feature.reversed}
                onChange={(event) =>
                  onChange({ reversed: event.target.checked })
                }
              />{" "}
              Invertir dirección del desmoldeo
            </label>
            <p className="muted-small">
              Se incluyen las caras tangentes conectadas a la selección.
            </p>
          </>
        )}
      </div>
      <div className="property-tip">
        <Info size={15} />
        <span>
          {feature.type === "shell"
            ? "Quita una o varias caras para abrir la pieza, o deja la selección vacía para crear una cavidad cerrada. Un espesor excesivo puede impedir el vaciado."
            : "Inclina caras respecto a un plano principal, un plano de referencia o una cara plana. La selección y el plano se conservan en el historial."}
        </span>
      </div>
    </>
  );
}
