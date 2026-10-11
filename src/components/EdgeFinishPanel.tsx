import { ChevronDown, Info, Trash2, X } from "lucide-react";
import type {
  EdgeFinishFeature,
  EdgeReference,
  EdgeSelection,
} from "../cad/kernel.types";

interface Props {
  feature: EdgeFinishFeature;
  onSize: (value: number) => void;
  onSelection: (value: EdgeSelection) => void;
  preview: boolean;
  onPreview: (value: boolean) => void;
  canPreview: boolean;
  loading: boolean;
}

export function sameEdge(a: EdgeReference, b: EdgeReference) {
  return a.sourceFeatureId === b.sourceFeatureId && a.key === b.key;
}

export default function EdgeFinishPanel({
  feature,
  onSize,
  onSelection,
  preview,
  onPreview,
  canPreview,
  loading,
}: Props) {
  const all = feature.selection.mode === "all";
  const edges =
    feature.selection.mode === "selected" ? feature.selection.edges : [];
  return (
    <>
      <div className="property-section">
        <h3>
          <ChevronDown size={12} /> Aristas del acabado
        </h3>
        <label className="finish-checkbox">
          <input
            type="checkbox"
            checked={all}
            onChange={(event) => {
              onSelection(
                event.target.checked
                  ? { mode: "all" }
                  : { mode: "selected", edges: [] },
              );
              onPreview(event.target.checked);
            }}
          />
          Todas las aristas
        </label>
        {!all && (
          <>
            <div className="edge-selection-header">
              <span>Aristas seleccionadas ({edges.length})</span>
              <button
                title="Vaciar selección de aristas"
                aria-label="Vaciar selección de aristas"
                disabled={!edges.length}
                onClick={() => onSelection({ mode: "selected", edges: [] })}
              >
                <Trash2 size={13} />
              </button>
            </div>
            <ul
              className="edge-selection-list"
              aria-label="Aristas seleccionadas"
            >
              {edges.map((edge, i) => (
                <li key={edge.sourceFeatureId + edge.key}>
                  <span>Arista {i + 1}</span>
                  <button
                    title={`Quitar arista ${i + 1}`}
                    aria-label={`Quitar arista ${i + 1}`}
                    onClick={() =>
                      onSelection({
                        mode: "selected",
                        edges: edges.filter(
                          (candidate) => !sameEdge(candidate, edge),
                        ),
                      })
                    }
                  >
                    <X size={13} />
                  </button>
                </li>
              ))}
              {!edges.length && (
                <li className="selection-placeholder">
                  Haz clic en las aristas de la pieza.
                </li>
              )}
            </ul>
          </>
        )}
        <div className="finish-view-switch" aria-label="Vista del acabado">
          <button
            className={!preview ? "active" : ""}
            onClick={() => onPreview(false)}
            disabled={loading}
          >
            Seleccionar aristas
          </button>
          <button
            className={preview ? "active" : ""}
            onClick={() => onPreview(true)}
            disabled={!canPreview}
          >
            Vista previa
          </button>
        </div>
        <p className="muted-small">
          {loading
            ? "Preparando la pieza anterior al acabado…"
            : preview
              ? "La vista muestra el resultado del acabado."
              : "Gira la pieza para seleccionar sus aristas. Haz clic de nuevo para quitarlas."}
        </p>
      </div>
      <div className="property-section">
        <h3>
          <ChevronDown size={12} />{" "}
          {feature.type === "fillet" ? "Radio constante" : "Distancias iguales"}
        </h3>
        <label className="number-field">
          <span>{feature.type === "fillet" ? "Radio" : "Distancia"}</span>
          <div>
            <input
              type="number"
              aria-label={
                feature.type === "fillet"
                  ? "Radio del redondeo"
                  : "Distancia del chaflán"
              }
              min={0.01}
              step={0.5}
              value={Number.isFinite(feature.size) ? feature.size : ""}
              onChange={(event) => onSize(Number(event.target.value))}
            />
            <small>mm</small>
          </div>
        </label>
      </div>
      <div className="property-tip">
        <Info size={15} />
        <span>
          {feature.type === "fillet"
            ? "El radio se aplica a las aristas elegidas. Un radio excesivo puede impedir la operación."
            : "Se retira la misma distancia sobre las dos caras adyacentes a cada arista."}
        </span>
      </div>
    </>
  );
}
