import { ChevronDown, Info, MousePointer2 } from "lucide-react";
import type {
  Feature,
  Plane,
  PlaneSupport,
  ReferencePlaneFeature,
} from "../cad/kernel.types";

const names: Record<Plane, string> = {
  XY: "Alzado",
  XZ: "Planta",
  YZ: "Vista lateral",
};

export function supportLabel(
  support: PlaneSupport,
  features: Feature[],
): string {
  if (support.kind === "principal")
    return `${names[support.plane]} (${support.plane})`;
  const id =
    support.kind === "plane" ? support.planeId : support.face.sourceFeatureId;
  const name =
    features.find((feature) => feature.id === id)?.name ?? "Referencia perdida";
  return support.kind === "face" ? `Cara plana de ${name}` : name;
}

interface Props {
  support: PlaneSupport;
  features: Feature[];
  planes: ReferencePlaneFeature[];
  onChange: (support: PlaneSupport) => void;
  onPickFace: () => void;
  canPickFace: boolean;
  picking: boolean;
}

export default function PlaneSupportPanel({
  support,
  features,
  planes,
  onChange,
  onPickFace,
  canPickFace,
  picking,
}: Props) {
  const value =
    support.kind === "principal"
      ? `principal:${support.plane}`
      : support.kind === "plane"
        ? `plane:${support.planeId}`
        : "face";
  return (
    <div className="property-section plane-support">
      <h3>
        <ChevronDown size={12} /> Soporte
      </h3>
      <select
        aria-label="Soporte del plano"
        value={value}
        onChange={(event) => {
          const next = event.target.value;
          if (next.startsWith("principal:"))
            onChange({ kind: "principal", plane: next.slice(10) as Plane });
          else if (next.startsWith("plane:"))
            onChange({ kind: "plane", planeId: next.slice(6) });
        }}
      >
        {(Object.keys(names) as Plane[]).map((plane) => (
          <option key={plane} value={`principal:${plane}`}>
            {names[plane]} ({plane})
          </option>
        ))}
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
        {support.kind === "plane" &&
          !planes.some((plane) => plane.id === support.planeId) && (
            <option value={value}>Plano no disponible</option>
          )}
        {support.kind === "face" && (
          <option value="face">{supportLabel(support, features)}</option>
        )}
      </select>
      <button
        className={`outline-button ${picking ? "active" : ""}`}
        disabled={!canPickFace}
        onClick={onPickFace}
      >
        <MousePointer2 size={14} />{" "}
        {picking
          ? "Volver a editar"
          : support.kind === "face"
            ? "Cambiar cara de soporte"
            : "Seleccionar cara plana"}
      </button>
      <p className="muted-small">
        <Info size={12} />{" "}
        {picking
          ? "Selecciona una cara plana visible de la pieza. Las caras curvas no pueden alojar un croquis plano."
          : support.kind === "face"
            ? "La referencia sigue la cara al reconstruir. Si cambia su topología, puede ser necesario seleccionar el soporte de nuevo."
            : "El plano y los croquis que dependen de él se actualizan al editar su soporte."}
      </p>
    </div>
  );
}
