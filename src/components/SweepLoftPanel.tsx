import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Eye,
  MousePointer2,
  Plus,
  RotateCw,
  Trash2,
} from "lucide-react";
import type {
  Feature,
  BodyReference,
  LoftFeature,
  LoftSection,
  PickableBody,
  SketchFeature,
  SweepFeature,
} from "../cad/kernel.types";
import { initialLoftSection, resolvedSweepPath } from "../model/advancedInputs";
import { BodyList } from './BodyManagementPanel';
import { setBodyOperationDraft } from '../model/bodyCommands';

interface BodyEditor {
  bodies: readonly PickableBody[];
  selection: readonly BodyReference[];
  outputBodyId: string;
  existing: boolean;
  picking: boolean;
  loading: boolean;
  onSelection: (selection: BodyReference[]) => void;
  onPicking: (picking: boolean) => void;
  message?: string;
}

interface Props {
  feature: SweepFeature | LoftFeature;
  sketches: SketchFeature[];
  onChange: (patch: Partial<Feature>) => void;
  onError: (message: string) => void;
  bodyEditor?: BodyEditor;
}

export default function SweepLoftPanel({
  feature,
  sketches,
  onChange,
  onError,
  bodyEditor,
}: Props) {
  const options = (current: string) => (
    <>
      {!sketches.some((sketch) => sketch.id === current) && (
        <option value={current}>Selecciona un croquis</option>
      )}
      {sketches.map((sketch) => (
        <option key={sketch.id} value={sketch.id} disabled={sketch.suppressed}>
          {sketch.name}
          {sketch.suppressed ? " · suprimido" : ""}
        </option>
      ))}
    </>
  );
  const setSection = (index: number, patch: Partial<LoftSection>) => {
    if (feature.type !== "loft") return;
    onChange({
      sections: feature.sections.map((section, position) =>
        position === index ? { ...section, ...patch } : section,
      ),
    });
  };
  const moveSection = (index: number, delta: number) => {
    if (feature.type !== "loft") return;
    const sections = [...feature.sections];
    [sections[index], sections[index + delta]] = [
      sections[index + delta],
      sections[index],
    ];
    onChange({ sections });
  };
  return (
    <>
      {feature.type === "sweep" ? (
        <>
          <div className="property-section">
            <h3>
              <ChevronDown size={12} /> Perfil
            </h3>
            <select
              aria-label="Perfil del barrido"
              value={feature.profileSketchId}
              onChange={(event) =>
                onChange({ profileSketchId: event.target.value })
              }
            >
              {options(feature.profileSketchId)}
            </select>
            <p className="muted-small">
              Un contorno cerrado. El plano del perfil debe coincidir con el
              inicio y ser perpendicular al recorrido.
            </p>
          </div>
          <div className="property-section">
            <h3>
              <ChevronDown size={12} /> Trayectoria
            </h3>
            <select
              aria-label="Croquis de la trayectoria"
              value={feature.pathSketchId}
              onChange={(event) => {
                const sketch = sketches.find(
                  (candidate) => candidate.id === event.target.value,
                );
                if (!sketch) return;
                try {
                  onChange({
                    pathSketchId: sketch.id,
                    path: resolvedSweepPath(sketch),
                  });
                } catch (error) {
                  onError((error as Error).message);
                }
              }}
            >
              {options(feature.pathSketchId)}
            </select>
            <button
              className="outline-button"
              onClick={() =>
                onChange({
                  path: [...feature.path].reverse().map((segment) => ({
                    ...segment,
                    reversed: !segment.reversed,
                  })),
                })
              }
            >
              <RotateCw size={14} /> Invertir recorrido
            </button>
            <button
              className="outline-button"
              onClick={() => {
                const sketch = sketches.find(
                  (candidate) => candidate.id === feature.pathSketchId,
                );
                if (!sketch) return;
                try {
                  onChange({ path: resolvedSweepPath(sketch) });
                } catch (error) {
                  onError((error as Error).message);
                }
              }}
            >
              Actualizar entidades del recorrido
            </button>
            <ol className="feature-input-list" aria-label="Tramos del barrido">
              {feature.path.map((segment, index) => {
                const sketch = sketches.find(
                  (candidate) => candidate.id === feature.pathSketchId,
                );
                const entities =
                  sketch?.profile.kind === "entities"
                    ? sketch.profile.entities
                    : [];
                const entity = entities.find(
                  (candidate) => candidate.id === segment.entityId,
                );
                return (
                  <li key={segment.entityId}>
                    {index + 1}.{" "}
                    {entity
                      ? entity.type === "line"
                        ? "Línea"
                        : "Arco"
                      : "Referencia perdida"}{" "}
                    {segment.reversed ? "· sentido inverso" : ""}
                  </li>
                );
              })}
            </ol>
            <p className="muted-small">
              Cadena abierta de líneas y arcos. La sección sigue la trayectoria
              sin torsión adicional. Al añadir o quitar tramos del croquis,
              actualiza la selección.
            </p>
          </div>
        </>
      ) : (
        <div className="property-section">
          <h3>
            <ChevronDown size={12} /> Secciones ordenadas
          </h3>
          <p className="muted-small">
            Selecciona de dos a treinta y dos contornos cerrados. El comienzo y
            el sentido de cada contorno determinan cómo se unen.
          </p>
          <ol
            className="loft-section-list"
            aria-label="Secciones del recubrimiento"
          >
            {feature.sections.map((section, index) => {
              const sketch = sketches.find(
                (candidate) => candidate.id === section.sketchId,
              );
              const entities =
                sketch?.profile.kind === "entities"
                  ? sketch.profile.entities.filter(
                      (entity) => !entity.construction,
                    )
                  : [];
              return (
                <li key={`${index}:${section.sketchId}`}>
                  <div className="loft-section-heading">
                    <strong>Sección {index + 1}</strong>
                    <span>
                      <button
                        title={`Subir sección ${index + 1}`}
                        aria-label={`Subir sección ${index + 1}`}
                        disabled={index === 0}
                        onClick={() => moveSection(index, -1)}
                      >
                        <ArrowUp size={14} />
                      </button>
                      <button
                        title={`Bajar sección ${index + 1}`}
                        aria-label={`Bajar sección ${index + 1}`}
                        disabled={index === feature.sections.length - 1}
                        onClick={() => moveSection(index, 1)}
                      >
                        <ArrowDown size={14} />
                      </button>
                      <button
                        title={`Quitar sección ${index + 1}`}
                        aria-label={`Quitar sección ${index + 1}`}
                        disabled={feature.sections.length <= 2}
                        onClick={() =>
                          onChange({
                            sections: feature.sections.filter(
                              (_, position) => position !== index,
                            ),
                          })
                        }
                      >
                        <Trash2 size={14} />
                      </button>
                    </span>
                  </div>
                  <select
                    aria-label={`Croquis de sección ${index + 1}`}
                    value={section.sketchId}
                    onChange={(event) => {
                      const next = sketches.find(
                        (candidate) => candidate.id === event.target.value,
                      );
                      if (next) setSection(index, initialLoftSection(next));
                    }}
                  >
                    {options(section.sketchId)}
                  </select>
                  {entities.length > 0 && (
                    <select
                      aria-label={`Comienzo de sección ${index + 1}`}
                      value={section.startEntityId ?? ""}
                      onChange={(event) =>
                        setSection(index, { startEntityId: event.target.value })
                      }
                    >
                      {!entities.some(
                        (entity) => entity.id === section.startEntityId,
                      ) && (
                        <option value={section.startEntityId ?? ""}>
                          Selecciona la primera entidad
                        </option>
                      )}
                      {entities.map((entity, position) => (
                        <option key={entity.id} value={entity.id}>
                          {entity.type === "circle"
                            ? "Círculo"
                            : entity.type === "arc"
                              ? "Arco"
                              : "Línea"}{" "}
                          {position + 1}
                        </option>
                      ))}
                    </select>
                  )}
                  <label className="check-option">
                    <input
                      type="checkbox"
                      checked={section.reversed}
                      onChange={(event) =>
                        setSection(index, { reversed: event.target.checked })
                      }
                    />
                    Invertir contorno {index + 1}
                  </label>
                </li>
              );
            })}
          </ol>
          <button
            className="outline-button"
            disabled={
              feature.sections.length >= 32 ||
              !sketches.some(
                (sketch) =>
                  !sketch.suppressed &&
                  !feature.sections.some(
                    (section) => section.sketchId === sketch.id,
                  ),
              )
            }
            onClick={() => {
              const next = sketches.find(
                (sketch) =>
                  !sketch.suppressed &&
                  !feature.sections.some(
                    (section) => section.sketchId === sketch.id,
                  ),
              );
              if (next)
                onChange({
                  sections: [...feature.sections, initialLoftSection(next)],
                });
            }}
          >
            <Plus size={14} /> Añadir sección
          </button>
          <label className="check-option">
            <input
              type="checkbox"
              checked={feature.ruled}
              onChange={(event) => onChange({ ruled: event.target.checked })}
            />
            Unión recta entre secciones
          </label>
        </div>
      )}
      <div className="property-section">
        <h3>
          <ChevronDown size={12} /> Resultado
        </h3>
        {feature.bodyOperation ? <>
          <label>Resultado del cuerpo
            <select aria-label="Resultado del cuerpo" value={feature.bodyOperation.mode} disabled={!bodyEditor || bodyEditor.existing || bodyEditor.loading} onChange={event => {
              if (!bodyEditor) return;
              onChange(setBodyOperationDraft(feature, event.target.value === 'new'
                ? { mode: 'new', bodyId: bodyEditor.outputBodyId }
                : { mode: 'merge', target: bodyEditor.selection[0] ?? { bodyId: '', sourceFeatureId: '' } }));
            }}>
              <option value="new">Crear cuerpo separado</option>
              <option value="merge">Añadir material a un cuerpo</option>
            </select>
          </label>
          {feature.bodyOperation.mode === 'merge' && <>
            <p className="muted-small">Selecciona el cuerpo que recibirá el material.</p>
            <BodyList bodies={bodyEditor?.bodies ?? []} selection={bodyEditor?.selection ?? [feature.bodyOperation.target]}
              onSelection={bodyEditor?.onSelection ?? (() => undefined)} single disabled={!bodyEditor || bodyEditor.loading} />
            <button type="button" className={`outline-button ${bodyEditor?.picking ? 'active' : ''}`} disabled={!bodyEditor || bodyEditor.loading} onClick={() => bodyEditor?.onPicking(!bodyEditor.picking)}>
              <MousePointer2 size={14} /> Seleccionar cuerpo en el visor
            </button>
          </>}
          <button type="button" className="outline-button" disabled={!bodyEditor || bodyEditor.loading} onClick={() => bodyEditor?.onPicking(false)}><Eye size={14} /> Ver vista previa</button>
          {bodyEditor?.message && <p role="status" className="muted-small">{bodyEditor.message}</p>}
        </> : <>
        <label className="check-option">
          <input
            type="checkbox"
            checked={feature.merge}
            onChange={(event) => onChange({ merge: event.target.checked })}
          />
          Fusionar resultado
        </label>
        <p className="muted-small">
          Desactívalo para conservar la operación como cuerpo separado. Las
          referencias a los croquis se mantienen al editar sus cotas.
        </p>
        </>}
      </div>
    </>
  );
}
