import { useEffect, useRef, useState } from "react";
import { ChevronDown, Info, Trash2, X } from "lucide-react";
import type {
  EntityProfile,
  SketchConstraint,
  SketchEntity,
  SketchSelection,
  SketchSolveResult,
} from "../sketch/types";
import {
  entityLabel,
  entityPoints,
  measureEntity,
  removeSelection,
  sketchPoint,
  measureAngle,
  createAngularConstraint,
  createTangentConstraint,
  createDrivenDimension,
  isDimensionalConstraint,
  setDimensionDriven,
} from "../sketch/editing";
import type { AngleOptions } from "../sketch/editing";
import { SKETCH_LIMITS } from "../sketch/validation";
import { angleText, lengthText } from "../sketch/formatting";

interface Props {
  profile: EntityProfile;
  selection: SketchSelection[];
  onSelection: (selection: SketchSelection[]) => void;
  onChange: (profile: EntityProfile) => void;
  solution: SketchSolveResult | null;
  focusSection: { name: "dimensions" | "relations"; stamp: number };
}
const relationNames: Record<SketchConstraint["type"], string> = {
  fix: "Fijo",
  coincident: "Coincidente",
  horizontal: "Horizontal",
  vertical: "Vertical",
  parallel: "Paralela",
  perpendicular: "Perpendicular",
  equal: "Igual",
  pointOnLine: "Punto sobre línea",
  pointOnCircle: "Punto sobre curva circular",
  distance: "Distancia",
  distanceX: "Distancia horizontal",
  distanceY: "Distancia vertical",
  length: "Longitud",
  radius: "Radio",
  angle: "Ángulo",
  tangent: "Tangente",
};
type DimensionType =
  "length" | "radius" | "distance" | "distanceX" | "distanceY" | "angle";

const dimensionMinimum = (type: DimensionType) =>
  type === "angle"
    ? 0
    : type === "distanceX" || type === "distanceY"
      ? -SKETCH_LIMITS.maxDimension
      : type === "distance"
        ? Number.MIN_VALUE
        : SKETCH_LIMITS.minDimension;
const dimensionMaximum = (type: DimensionType) =>
  type === "angle" ? 360 : SKETCH_LIMITS.maxDimension;
const tangentNames = {
  left: "Centro a la izquierda",
  right: "Centro a la derecha",
  external: "Exterior",
  aContainsB: "Primera contiene segunda",
  bContainsA: "Segunda contiene primera",
};

const numberText = (value: number) =>
  Number.isFinite(value) ? String(Number(value.toPrecision(12))) : "";

function DraftNumberInput({
  value,
  onCommit,
  label,
  minimum,
  maximum,
  disabled = false,
  resetKey,
  onDraftValidity,
  exclusiveBounds = false,
}: {
  value: number;
  onCommit: (value: number) => void;
  label: string;
  minimum: number;
  maximum: number;
  disabled?: boolean;
  resetKey?: string;
  onDraftValidity?: (valid: boolean) => void;
  exclusiveBounds?: boolean;
}) {
  const [draft, setDraft] = useState(() => numberText(value));
  const [rejected, setRejected] = useState(false);
  const [commitVersion, setCommitVersion] = useState(0);
  const dirty = useRef(false);
  const inRange = (number: number) =>
    Number.isFinite(number) &&
    (exclusiveBounds
      ? number > minimum && number < maximum
      : number >= minimum && number <= maximum);
  const parse = (text: string): number | null => {
    const normalized = text.trim().replace(",", ".");
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(normalized))
      return null;
    const number = Number(normalized);
    return inRange(number) ? number : null;
  };
  useEffect(() => {
    setDraft(numberText(value));
    setRejected(false);
    dirty.current = false;
    onDraftValidity?.(inRange(value));
  }, [value, minimum, maximum, exclusiveBounds, resetKey, commitVersion]);
  const commit = () => {
    if (!dirty.current) return;
    const next = parse(draft);
    if (next === null) {
      setRejected(true);
      onDraftValidity?.(false);
      return;
    }
    dirty.current = false;
    setRejected(false);
    onDraftValidity?.(true);
    if (next !== value) onCommit(next);
    // The solver can keep a fixed point at its old coordinate. Sync back to
    // the resulting prop even when its numeric value did not change.
    setCommitVersion((old) => old + 1);
  };
  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label={label}
      aria-invalid={rejected || undefined}
      title={
        rejected
          ? "Introduce un número válido dentro del intervalo permitido. Esc restaura el valor anterior."
          : undefined
      }
      style={
        rejected
          ? { outline: "1px solid #c43332", outlineOffset: -1 }
          : undefined
      }
      disabled={disabled}
      value={draft}
      onChange={(event) => {
        dirty.current = true;
        setDraft(event.target.value);
        setRejected(false);
        onDraftValidity?.(parse(event.target.value) !== null);
      }}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.stopPropagation();
          commit();
        } else if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          dirty.current = false;
          setDraft(numberText(value));
          setRejected(false);
          onDraftValidity?.(inRange(value));
        }
      }}
    />
  );
}

export default function EntitySketchPanel({
  profile: sourceProfile,
  selection,
  onSelection,
  onChange,
  solution,
  focusSection,
}: Props) {
  const profile =
    solution && ["underdefined", "fullyDefined"].includes(solution.status)
      ? solution.profile
      : sourceProfile;
  const dimensionSection = useRef<HTMLDivElement>(null),
    relationSection = useRef<HTMLDivElement>(null);
  const [dimensionType, setDimensionType] = useState<DimensionType>("length"),
    [dimensionValue, setDimensionValue] = useState(10);
  const dimensionValueRef = useRef(dimensionValue);
  dimensionValueRef.current = dimensionValue;
  const [dimensionDraftValid, setDimensionDraftValid] = useState(true);
  const [angleOptions, setAngleOptions] = useState<AngleOptions>({
    reversedA: false,
    reversedB: false,
    clockwise: false,
  });
  const [relationError, setRelationError] = useState("");
  const [dimensionError, setDimensionError] = useState("");
  const [createAsDriven, setCreateAsDriven] = useState(false);
  const previousSelectionKey = useRef<string | null>(null);
  const selectedEntities = selection
    .filter((item) => item.kind === "entity")
    .map((item) => profile.entities.find((entity) => entity.id === item.id))
    .filter((entity): entity is SketchEntity => !!entity);
  const selectedPoints = selection
    .filter((item) => item.kind === "point")
    .map((item) => sketchPoint(profile, item.id))
    .filter(Boolean);
  const selectedConstraint =
    selection.length === 1 && selection[0].kind === "constraint"
      ? profile.constraints.find(
          (constraint) => constraint.id === selection[0].id,
        )
      : undefined;
  const oneEntity =
    selectedEntities.length === 1 && selection.length === 1
      ? selectedEntities[0]
      : undefined;
  const twoPoints = selectedPoints.length === 2 && selection.length === 2;
  const twoLines =
    selectedEntities.length === 2 &&
    selection.length === 2 &&
    selectedEntities.every((entity) => entity.type === "line");
  const dimensionAvailable = !!oneEntity || twoPoints || twoLines;
  const selectionKey = JSON.stringify(selection);
  // Changes to unrelated constraints, status or focus must not overwrite a
  // manually typed dimension. Only the selected geometry resets the measure.
  const geometryKey = JSON.stringify(
    oneEntity
      ? {
          type: oneEntity.type,
          radius: oneEntity.type === "circle" ? oneEntity.radius : undefined,
          clockwise: oneEntity.type === "arc" ? oneEntity.clockwise : undefined,
          points: entityPoints(oneEntity).map((id) => sketchPoint(profile, id)),
        }
      : twoLines
        ? selectedEntities.map((entity) => ({
            id: entity.id,
            points: entityPoints(entity).map((id) => sketchPoint(profile, id)),
          }))
        : selectedPoints,
  );
  const measure = (type: DimensionType, options = angleOptions) => {
    if (type === "angle" && twoLines) {
      try {
        return measureAngle(
          profile,
          selectedEntities[0].id,
          selectedEntities[1].id,
          options,
        );
      } catch {
        return 90;
      }
    }
    if (oneEntity) return measureEntity(profile, oneEntity);
    if (twoPoints) {
      const [a, b] = selectedPoints;
      return type === "distanceX"
        ? b.x - a.x
        : type === "distanceY"
          ? b.y - a.y
          : Math.hypot(b.x - a.x, b.y - a.y);
    }
    return 10;
  };
  useEffect(() => {
    const changedSelection = previousSelectionKey.current !== selectionKey;
    previousSelectionKey.current = selectionKey;
    const type: DimensionType = changedSelection
      ? oneEntity
        ? oneEntity.type === "line"
          ? "length"
          : "radius"
        : twoLines
          ? "angle"
          : "distance"
      : dimensionType;
    let options = angleOptions;
    if (changedSelection && twoLines) {
      options = {
        reversedA: false,
        reversedB: false,
        clockwise: measure("angle", {}) > 180,
      };
      setAngleOptions(options);
    }
    const raw = measure(type, options);
    const measured =
      type === "angle" && (raw <= 0 || raw >= 360)
        ? 90
        : type === "angle"
          ? raw
          : Number(raw.toFixed(8));
    setRelationError("");
    setDimensionError("");
    setDimensionType(type);
    dimensionValueRef.current = measured;
    setDimensionValue(measured);
  }, [selectionKey, geometryKey]);
  useEffect(() => {
    if (!focusSection.stamp) return;
    (focusSection.name === "dimensions"
      ? dimensionSection
      : relationSection
    ).current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [focusSection]);
  const change = (operation: (next: EntityProfile) => void) => {
    const next = structuredClone(profile);
    operation(next);
    onChange(next);
  };
  const addConstraint = (constraint: SketchConstraint) =>
    change((next) => {
      next.constraints.push(constraint);
    });
  const addDimension = () => {
    if (createAsDriven) {
      try {
        const definition = twoLines
          ? {
              type: "angle" as const,
              a: selectedEntities[0].id,
              b: selectedEntities[1].id,
              ...angleOptions,
            }
          : oneEntity
            ? {
                type:
                  oneEntity.type === "line"
                    ? ("length" as const)
                    : ("radius" as const),
                entityId: oneEntity.id,
              }
            : twoPoints
              ? {
                  type: dimensionType as "distance" | "distanceX" | "distanceY",
                  a: selectedPoints[0].id,
                  b: selectedPoints[1].id,
                }
              : null;
        if (!definition) return;
        addConstraint(createDrivenDimension(profile, definition));
        setDimensionError("");
      } catch (error) {
        setDimensionError(
          error instanceof Error
            ? error.message
            : "No se puede medir esta selección.",
        );
      }
      return;
    }
    const value = dimensionValueRef.current;
    if (
      !dimensionDraftValid ||
      !Number.isFinite(value) ||
      value < dimensionMinimum(dimensionType) ||
      value > dimensionMaximum(dimensionType) ||
      (dimensionType === "angle" && (value <= 0 || value >= 360))
    )
      return;
    const id = crypto.randomUUID();
    if (twoLines) {
      try {
        addConstraint(
          createAngularConstraint(
            profile,
            selectedEntities[0].id,
            selectedEntities[1].id,
            { ...angleOptions, id, value },
          ),
        );
        setRelationError("");
      } catch (error) {
        setRelationError(
          error instanceof Error
            ? error.message
            : "No se puede crear la cota angular.",
        );
      }
    } else if (oneEntity)
      addConstraint({
        id,
        type: oneEntity.type === "line" ? "length" : "radius",
        entityId: oneEntity.id,
        value,
      });
    else if (twoPoints)
      addConstraint({
        id,
        type: dimensionType as "distance" | "distanceX" | "distanceY",
        a: selectedPoints[0].id,
        b: selectedPoints[1].id,
        value,
      });
  };
  const relations: { label: string; create: () => SketchConstraint }[] = [];
  if (oneEntity?.type === "line")
    ["horizontal", "vertical"].forEach((type) =>
      relations.push({
        label: relationNames[type as "horizontal"],
        create: () => ({
          id: crypto.randomUUID(),
          type: type as "horizontal" | "vertical",
          entityId: oneEntity.id,
        }),
      }),
    );
  if (
    selectedPoints.length === 1 &&
    selection.length === 1 &&
    selectedPoints[0].id !== "origin"
  ) {
    const point = selectedPoints[0];
    relations.push({
      label: "Fijar punto",
      create: () => ({
        id: crypto.randomUUID(),
        type: "fix",
        pointId: point.id,
        x: point.x,
        y: point.y,
      }),
    });
  }
  if (twoPoints)
    relations.push({
      label: "Coincidente",
      create: () => ({
        id: crypto.randomUUID(),
        type: "coincident",
        a: selectedPoints[0].id,
        b: selectedPoints[1].id,
      }),
    });
  if (selectedEntities.length === 2 && selection.length === 2) {
    const [a, b] = selectedEntities;
    if (a.type !== "line" || b.type !== "line")
      relations.push({
        label: "Tangente",
        create: () => createTangentConstraint(profile, a.id, b.id),
      });
    if (a.type === "line" && b.type === "line")
      ["parallel", "perpendicular"].forEach((type) =>
        relations.push({
          label: relationNames[type as "parallel"],
          create: () => ({
            id: crypto.randomUUID(),
            type: type as "parallel" | "perpendicular",
            a: a.id,
            b: b.id,
          }),
        }),
      );
    if ((a.type === "line") === (b.type === "line"))
      relations.push({
        label: "Igual",
        create: () => ({
          id: crypto.randomUUID(),
          type: "equal",
          a: a.id,
          b: b.id,
        }),
      });
  }
  if (
    selection.length === 2 &&
    selectedPoints.length === 1 &&
    selectedEntities.length === 1
  )
    relations.push({
      label:
        selectedEntities[0].type === "line"
          ? "Punto sobre línea"
          : "Punto sobre curva circular",
      create: () => ({
        id: crypto.randomUUID(),
        type:
          selectedEntities[0].type === "line" ? "pointOnLine" : "pointOnCircle",
        pointId: selectedPoints[0].id,
        entityId: selectedEntities[0].id,
      }),
    });
  const toggle = (item: SketchSelection) =>
    onSelection(
      selection.some((old) => old.kind === item.kind && old.id === item.id)
        ? selection.filter(
            (old) => old.kind !== item.kind || old.id !== item.id,
          )
        : [...selection, item],
    );
  const constraintText = (constraint: SketchConstraint) => {
    const name = relationNames[constraint.type];
    const entityId = "entityId" in constraint ? constraint.entityId : undefined;
    const index = profile.entities.findIndex(
      (entity) => entity.id === entityId,
    );
    const owner = index >= 0 ? entityLabel(profile.entities[index], index) : "";
    if (isDimensionalConstraint(constraint) && constraint.driven) {
      const measured = solution?.drivenValues[constraint.id];
      const text =
        measured === null || measured === undefined
          ? "—"
          : constraint.type === "angle"
            ? angleText(measured)
            : lengthText(measured);
      return `${name}${owner ? ` · ${owner}` : ""} · conducida = (${text} ${constraint.type === "angle" ? "°" : "mm"})`;
    }
    return `${name}${owner ? ` · ${owner}` : ""}${"value" in constraint ? ` = ${constraint.type === "angle" ? angleText(constraint.value) : Number(constraint.value.toFixed(3))} ${constraint.type === "angle" ? "°" : "mm"}` : constraint.type === "tangent" ? ` · ${tangentNames[constraint.branch]}` : ""}`;
  };
  const angleEditor =
    selectedConstraint?.type === "angle"
      ? selectedConstraint
      : twoLines
        ? {
            ...angleOptions,
            a: selectedEntities[0].id,
            b: selectedEntities[1].id,
          }
        : null;
  const referencedEntityName = (id: string) => {
    const index = profile.entities.findIndex((entity) => entity.id === id);
    return index >= 0
      ? entityLabel(profile.entities[index], index)
      : "Referencia perdida";
  };
  const updateAngleOptions = (patch: AngleOptions) => {
    if (!angleEditor) return;
    const options = { ...angleEditor, ...patch };
    try {
      const value = measureAngle(profile, options.a, options.b, options);
      if (
        !(value > 0 && value < 360) &&
        !(selectedConstraint?.type === "angle"
          ? selectedConstraint.driven
          : createAsDriven)
      )
        throw new Error(
          "Este sector mide 0°. Usa una relación Paralela o elige otro sector.",
        );
      if (selectedConstraint?.type === "angle")
        change((next) => {
          const index = next.constraints.findIndex(
            (item) => item.id === selectedConstraint.id,
          );
          next.constraints[index] = {
            ...selectedConstraint,
            ...patch,
            ...(selectedConstraint.driven ? {} : { value }),
          };
        });
      else {
        setAngleOptions(options);
        dimensionValueRef.current = value;
        setDimensionValue(value);
      }
      setRelationError("");
    } catch (error) {
      setRelationError(
        error instanceof Error ? error.message : "Revisa los rayos del ángulo.",
      );
    }
  };
  return (
    <>
      <div
        className={`sketch-solver-status ${solution?.status ?? ""}`}
        role="status"
      >
        <strong>{solution?.message ?? "Croquis de entidades"}</strong>
        {solution?.degreesOfFreedom !== null && solution && (
          <span>{solution.degreesOfFreedom} grados de libertad</span>
        )}
        {!!solution?.redundantConstraintIds.length && (
          <small>
            {solution.redundantConstraintIds.length} relaciones redundantes
            compatibles
          </small>
        )}
      </div>
      <div className="property-section">
        <h3>
          <ChevronDown size={12} /> Entidades ({profile.entities.length})
        </h3>
        <div className="sketch-entity-list" aria-label="Entidades del croquis">
          {profile.entities.map((entity, index) => (
            <label key={entity.id}>
              <input
                type="checkbox"
                checked={selection.some(
                  (item) => item.kind === "entity" && item.id === entity.id,
                )}
                onChange={() => toggle({ kind: "entity", id: entity.id })}
              />
              {entityLabel(entity, index)}
              {entity.construction && <small>Auxiliar</small>}
            </label>
          ))}
          {!profile.entities.length && (
            <p className="muted-small">
              Dibuja líneas, rectángulos, círculos o arcos con las herramientas
              superiores.
            </p>
          )}
        </div>
        <details className="sketch-point-list">
          <summary>Puntos y origen</summary>
          <label>
            <input
              type="checkbox"
              checked={selection.some(
                (item) => item.kind === "point" && item.id === "origin",
              )}
              onChange={() => toggle({ kind: "point", id: "origin" })}
            />
            Origen (0, 0)
          </label>
          {profile.points.map((point, index) => (
            <label key={point.id}>
              <input
                type="checkbox"
                checked={selection.some(
                  (item) => item.kind === "point" && item.id === point.id,
                )}
                onChange={() => toggle({ kind: "point", id: point.id })}
              />
              Punto {index + 1}{" "}
              <small>
                {Number(point.x.toFixed(2))}, {Number(point.y.toFixed(2))}
              </small>
            </label>
          ))}
        </details>
        <div className="sketch-selection-actions">
          <button disabled={!selection.length} onClick={() => onSelection([])}>
            <X size={13} /> Limpiar selección
          </button>
          <button
            disabled={!selection.some((item) => item.id !== "origin")}
            onClick={() => {
              onChange(removeSelection(profile, selection));
              onSelection([]);
            }}
            title="Eliminar selección del croquis"
          >
            <Trash2 size={13} />
          </button>
        </div>
        {!!selectedEntities.length && (
          <label className="finish-checkbox">
            <input
              type="checkbox"
              checked={selectedEntities.every((entity) => entity.construction)}
              onChange={(event) =>
                change((next) =>
                  next.entities.forEach((entity) => {
                    if (
                      selectedEntities.some(
                        (selected) => selected.id === entity.id,
                      )
                    )
                      entity.construction = event.target.checked;
                  }),
                )
              }
            />
            Geometría de construcción
          </label>
        )}
        {oneEntity?.type === "arc" && (
          <label className="finish-checkbox">
            <input
              type="checkbox"
              checked={oneEntity.clockwise}
              onChange={(event) =>
                change((next) => {
                  const arc = next.entities.find(
                    (entity) => entity.id === oneEntity.id,
                  )!;
                  if (arc.type === "arc") arc.clockwise = event.target.checked;
                })
              }
            />
            Sentido horario
          </label>
        )}
        {selectedPoints.length === 1 &&
          selection.length === 1 &&
          selectedPoints[0].id !== "origin" && (
            <div className="sketch-point-coordinates">
              {(["x", "y"] as const).map((axis) => (
                <label className="number-field" key={axis}>
                  <span>Posición {axis.toUpperCase()}</span>
                  <div>
                    <DraftNumberInput
                      key={`${selectedPoints[0].id}:${axis}`}
                      label={`Posición ${axis.toUpperCase()} del punto`}
                      value={selectedPoints[0][axis]}
                      minimum={-SKETCH_LIMITS.maxCoordinate}
                      maximum={SKETCH_LIMITS.maxCoordinate}
                      onCommit={(value) =>
                        change((next) => {
                          next.points.find(
                            (point) => point.id === selectedPoints[0].id,
                          )![axis] = value;
                        })
                      }
                    />
                    <small>mm</small>
                  </div>
                </label>
              ))}
              <p className="muted-small">
                Las relaciones y cotas activas gobiernan la posición final.
              </p>
            </div>
          )}
      </div>
      <div className="property-section" ref={dimensionSection}>
        <h3>
          <ChevronDown size={12} /> Cotas
        </h3>
        {selectedConstraint && isDimensionalConstraint(selectedConstraint) && (
          <label className="finish-checkbox">
            <input
              type="checkbox"
              checked={!!selectedConstraint.driven}
              onChange={(event) => {
                try {
                  onChange(
                    setDimensionDriven(
                      profile,
                      selectedConstraint.id,
                      event.target.checked,
                    ),
                  );
                  setDimensionError("");
                } catch (error) {
                  setDimensionError(
                    error instanceof Error
                      ? error.message
                      : "No se puede cambiar el modo de esta cota.",
                  );
                }
              }}
            />
            Cota conducida · solo lectura
          </label>
        )}
        {selectedConstraint && "value" in selectedConstraint ? (
          <label className="number-field">
            <span>{relationNames[selectedConstraint.type]}</span>
            <div>
              {selectedConstraint.driven ? (
                <output
                  className="driven-dimension-value"
                  aria-label="Medida de cota conducida"
                >
                  {solution?.drivenValues[selectedConstraint.id] === null ||
                  solution?.drivenValues[selectedConstraint.id] === undefined
                    ? "—"
                    : selectedConstraint.type === "angle"
                      ? angleText(solution.drivenValues[selectedConstraint.id]!)
                      : lengthText(
                          solution.drivenValues[selectedConstraint.id]!,
                        )}
                </output>
              ) : (
                <DraftNumberInput
                  key={selectedConstraint.id}
                  label="Valor de la cota seleccionada"
                  value={selectedConstraint.value}
                  minimum={dimensionMinimum(selectedConstraint.type)}
                  maximum={dimensionMaximum(selectedConstraint.type)}
                  exclusiveBounds={selectedConstraint.type === "angle"}
                  onCommit={(value) =>
                    change((next) => {
                      const constraint = next.constraints.find(
                        (c) => c.id === selectedConstraint.id,
                      )!;
                      if ("value" in constraint) constraint.value = value;
                    })
                  }
                />
              )}
              <small>{selectedConstraint.type === "angle" ? "°" : "mm"}</small>
            </div>
          </label>
        ) : (
          <>
            <p className="muted-small">
              Selecciona una entidad, dos puntos o dos líneas para acotar.
            </p>
            <label className="finish-checkbox">
              <input
                type="checkbox"
                checked={createAsDriven}
                onChange={(event) => {
                  setCreateAsDriven(event.target.checked);
                  setDimensionError("");
                }}
              />
              Crear cota conducida
            </label>
            <select
              aria-label="Tipo de cota"
              disabled={!dimensionAvailable}
              value={dimensionType}
              onChange={(event) => {
                const type = event.target.value as DimensionType;
                setDimensionType(type);
                setDimensionValue(Number(measure(type).toFixed(4)));
              }}
            >
              {oneEntity ? (
                <option value={oneEntity.type === "line" ? "length" : "radius"}>
                  {oneEntity.type === "line" ? "Longitud" : "Radio"}
                </option>
              ) : twoLines ? (
                <option value="angle">Ángulo entre líneas</option>
              ) : (
                <>
                  <option value="distance">Distancia</option>
                  <option value="distanceX">
                    Distancia horizontal (con signo)
                  </option>
                  <option value="distanceY">
                    Distancia vertical (con signo)
                  </option>
                </>
              )}
            </select>
            <label className="number-field">
              <span>Valor</span>
              <div>
                {createAsDriven ? (
                  <output
                    className="driven-dimension-value"
                    aria-label="Medida de nueva cota conducida"
                  >
                    {dimensionAvailable &&
                    solution &&
                    ["underdefined", "fullyDefined"].includes(solution.status)
                      ? dimensionType === "angle"
                        ? angleText(measure(dimensionType))
                        : lengthText(measure(dimensionType))
                      : "—"}
                  </output>
                ) : (
                  <DraftNumberInput
                    label="Valor de nueva cota"
                    disabled={!dimensionAvailable}
                    value={dimensionValue}
                    minimum={dimensionMinimum(dimensionType)}
                    maximum={dimensionMaximum(dimensionType)}
                    exclusiveBounds={dimensionType === "angle"}
                    resetKey={`${selectionKey}|${geometryKey}|${dimensionType}`}
                    onDraftValidity={setDimensionDraftValid}
                    onCommit={(value) => {
                      dimensionValueRef.current = value;
                      setDimensionValue(value);
                    }}
                  />
                )}
                <small>{dimensionType === "angle" ? "°" : "mm"}</small>
              </div>
            </label>
            <button
              className="outline-button"
              disabled={
                !dimensionAvailable ||
                (createAsDriven
                  ? !solution ||
                    !["underdefined", "fullyDefined"].includes(solution.status)
                  : !dimensionDraftValid)
              }
              onClick={addDimension}
            >
              {createAsDriven ? "Añadir cota conducida" : "Añadir cota"}
            </button>
          </>
        )}
        {(createAsDriven ||
          (selectedConstraint &&
            "value" in selectedConstraint &&
            selectedConstraint.driven)) && (
          <p className="muted-small">
            Las cotas conducidas se actualizan al resolver el croquis. No mueven
            la geometría ni añaden restricciones.
          </p>
        )}
        {dimensionError && (
          <p role="alert" className="dimension-error">
            {dimensionError}
          </p>
        )}
        {angleEditor && (
          <div className="angular-options">
            <p className="muted-small">
              Primer rayo: {referencedEntityName(angleEditor.a)}. Segundo rayo:{" "}
              {referencedEntityName(angleEditor.b)}.
            </p>
            <p className="muted-small">
              El arco muestra el sector elegido. Invertir un rayo utiliza la
              prolongación de su línea.
            </p>
            <label className="check-field">
              <input
                type="checkbox"
                checked={!!angleEditor.reversedA}
                onChange={(event) =>
                  updateAngleOptions({ reversedA: event.target.checked })
                }
              />
              Invertir primer rayo
            </label>
            <label className="check-field">
              <input
                type="checkbox"
                checked={!!angleEditor.reversedB}
                onChange={(event) =>
                  updateAngleOptions({ reversedB: event.target.checked })
                }
              />
              Invertir segundo rayo
            </label>
            <select
              aria-label="Sentido de la cota angular"
              value={angleEditor.clockwise ? "cw" : "ccw"}
              onChange={(event) =>
                updateAngleOptions({ clockwise: event.target.value === "cw" })
              }
            >
              <option value="ccw">Sentido antihorario</option>
              <option value="cw">Sentido horario</option>
            </select>
          </div>
        )}
      </div>
      <div className="property-section" ref={relationSection}>
        <h3>
          <ChevronDown size={12} /> Añadir relaciones
        </h3>
        <div className="relation-choices">
          {relations.map((relation) => (
            <button
              key={relation.label}
              onClick={() => {
                try {
                  addConstraint(relation.create());
                  setRelationError("");
                } catch (error) {
                  setRelationError(
                    error instanceof Error
                      ? error.message
                      : "No se puede crear la relación.",
                  );
                }
              }}
            >
              {relation.label}
            </button>
          ))}
        </div>
        {selectedConstraint?.type === "tangent" && (
          <>
            <p className="muted-small">
              Primera: {referencedEntityName(selectedConstraint.a)}. Segunda:{" "}
              {referencedEntityName(selectedConstraint.b)}.
            </p>
            <label className="muted-small" htmlFor="tangent-branch">
              Solución de tangencia
            </label>
            <select
              id="tangent-branch"
              aria-label="Solución de tangencia"
              value={selectedConstraint.branch}
              onChange={(event) =>
                change((next) => {
                  const index = next.constraints.findIndex(
                    (item) => item.id === selectedConstraint.id,
                  );
                  next.constraints[index] = {
                    ...selectedConstraint,
                    branch: event.target
                      .value as typeof selectedConstraint.branch,
                  };
                })
              }
            >
              {(selectedConstraint.branch === "left" ||
              selectedConstraint.branch === "right"
                ? (["left", "right"] as const)
                : (["external", "aContainsB", "bContainsA"] as const)
              ).map((branch) => (
                <option key={branch} value={branch}>
                  {tangentNames[branch]}
                </option>
              ))}
            </select>
          </>
        )}
        {(relations.some((relation) => relation.label === "Tangente") ||
          selectedConstraint?.type === "tangent") && (
          <p className="muted-small">
            La relación usa la recta y la circunferencia completas. Para unir
            extremos, añade también Coincidente.
          </p>
        )}
        {relationError && (
          <p role="alert" className="muted-small" style={{ color: "#b2312f" }}>
            {relationError}
          </p>
        )}
        {!relations.length && (
          <p className="muted-small">
            Selecciona entidades o puntos. Usa Ctrl para combinar selecciones, o
            las casillas de la lista.
          </p>
        )}
      </div>
      <div className="property-section">
        <h3>
          <ChevronDown size={12} /> Relaciones y cotas (
          {profile.constraints.length})
        </h3>
        <ul className="sketch-constraint-list" aria-label="Relaciones y cotas">
          {profile.constraints.map((constraint) => (
            <li
              key={constraint.id}
              className={
                (solution?.conflictingConstraintIds.includes(constraint.id)
                  ? "conflict "
                  : "") +
                (selection.some(
                  (item) =>
                    item.kind === "constraint" && item.id === constraint.id,
                )
                  ? "selected"
                  : "")
              }
            >
              <button
                className="constraint-label"
                onClick={() =>
                  onSelection([{ kind: "constraint", id: constraint.id }])
                }
              >
                {constraintText(constraint)}
              </button>
              <button
                title={`Eliminar ${constraintText(constraint)}`}
                aria-label={`Eliminar ${constraintText(constraint)}`}
                onClick={() => {
                  change((next) => {
                    next.constraints = next.constraints.filter(
                      (c) => c.id !== constraint.id,
                    );
                  });
                  onSelection(
                    selection.filter((item) => item.id !== constraint.id),
                  );
                }}
              >
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="property-tip">
        <Info size={15} />
        <span>
          Un croquis puede contener varios contornos y agujeros. Para crear un
          sólido, sus perfiles deben estar cerrados. Las entidades auxiliares no
          forman parte del sólido.
        </span>
      </div>
    </>
  );
}
