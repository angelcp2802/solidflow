import { makeCompound, measureShapeVolumeProperties, type Shape3D } from 'replicad';
import type { Feature, PlaneFrame, RepetitionFeature, Vec3 } from './kernel.types';

export const isRepetition = (feature: Feature): feature is RepetitionFeature =>
  feature.type === 'linearPattern' || feature.type === 'circularPattern' || feature.type === 'mirror';
export interface GeometryDelta { added: Shape3D | null; removed: Shape3D | null; dispose(): void }
export interface FeatureGeometry { id: string; order: number; lineage: string; delta?: GeometryDelta; error?: string }
export type PatternTransform = { key: string; translation: Vec3 } | { key: string; angle: number; origin: Vec3; direction: Vec3 }
  | { key: string; mirror: PlaneFrame };
export interface PatternPlan { transforms: PatternTransform[]; structure: unknown }
const EPS = 1e-8;
const volumeOf = (shape: Shape3D) => {
  const properties = measureShapeVolumeProperties(shape);
  try { return properties.volume; } finally { properties.delete(); }
};
const volumeTolerance = (volume: number) => Math.max(EPS, Math.abs(volume) * 1e-10);
function normalized(value: Vec3, name: string): Vec3 {
  if (!Array.isArray(value) || value.length !== 3 || value.some((coordinate) => !Number.isFinite(coordinate) || Math.abs(coordinate) > 1e6)) {
    throw new Error(`${name}: indica tres componentes finitas entre −1.000.000 y 1.000.000.`);
  }
  const length = Math.hypot(...value);
  if (length < 1e-12) throw new Error(`${name}: la dirección no puede ser nula.`);
  return value.map((coordinate) => coordinate / length) as Vec3;
}
function count(value: number, minimum: number) {
  if (!Number.isInteger(value) || value < minimum || value > 256) throw new Error(`El número de instancias debe ser entero entre ${minimum} y 256, incluida la semilla.`);
}
const canonical = (vector: Vec3) => vector.map((value) => Math.round(value * 1e10) / 1e10);

export function patternPlan(feature: RepetitionFeature, mirror?: PlaneFrame): PatternPlan {
  if (feature.type === 'mirror') {
    if (!mirror) throw new Error('No se encuentra el plano resuelto de simetría.');
    if (typeof feature.mergeBodies !== 'boolean') throw new Error('La opción de fusionar cuerpos no es válida.');
    if (feature.source.mode === 'features' && feature.mergeBodies) throw new Error('Fusionar cuerpos sólo se aplica al modo cuerpo de la simetría.');
    return { transforms: [{ key: 'mirror', mirror }], structure: [feature.type, feature.mergeBodies, feature.support.kind,
      canonical(mirror.normal), canonical(mirror.xDirection)] };
  }
  if (feature.type === 'linearPattern') {
    const direction = (entry: typeof feature.first) => {
      count(entry.count, 1);
      if (!Number.isFinite(entry.spacing) || entry.spacing < .01 || entry.spacing > 100000) throw new Error('La separación debe estar entre 0,01 y 100.000 mm.');
      return normalized(entry.direction, 'Dirección de matriz');
    };
    const first = direction(feature.first), second = feature.second ? direction(feature.second) : null;
    if (typeof feature.secondSeedOnly !== 'boolean') throw new Error('La opción de repetir sólo la semilla no es válida.');
    const n = feature.first.count, m = feature.second?.count ?? 1;
    const total = feature.secondSeedOnly ? n + m - 1 : n * m;
    if (total < 2 || total > 256) throw new Error('La matriz debe tener entre 2 y 256 instancias en total, incluida la semilla.');
    const skipped = new Set<string>();
    for (const address of feature.skipped) {
      if (!Array.isArray(address) || address.length !== 2) throw new Error('Dirección de instancia omitida no válida.');
      const [i, j] = address, key = `${i},${j}`;
      if (!Number.isInteger(i) || !Number.isInteger(j) || i < 0 || i >= n || j < 0 || j >= m || (i === 0 && j === 0)
        || (feature.secondSeedOnly && i > 0 && j > 0) || skipped.has(key)) throw new Error('La lista de instancias omitidas contiene una dirección inexistente, repetida o la semilla.');
      skipped.add(key);
    }
    const transforms: PatternTransform[] = [], positions: Vec3[] = [[0, 0, 0]];
    for (let j = 0; j < m; j++) for (let i = 0; i < n; i++) {
      const key = `${i},${j}`;
      if ((!i && !j) || (feature.secondSeedOnly && i > 0 && j > 0) || skipped.has(key)) continue;
      const translation = first.map((value, axis) => value * feature.first.spacing * i + (second?.[axis] ?? 0) * (feature.second?.spacing ?? 0) * j) as Vec3;
      if (positions.some((point) => Math.hypot(...point.map((value, axis) => value - translation[axis])) < 1e-7)) {
        throw new Error('Las direcciones y separaciones generan instancias coincidentes. Cambia la matriz u omite las duplicadas.');
      }
      positions.push(translation); transforms.push({ key, translation });
    }
    if (!transforms.length) throw new Error('No queda ninguna instancia nueva después de las omisiones.');
    return { transforms, structure: [feature.type, canonical(first), second ? canonical(second) : null,
      n, m, feature.secondSeedOnly, [...skipped].sort()] };
  }
  count(feature.count, 2);
  const direction = normalized(feature.axis.direction, 'Eje de matriz');
  const origin = feature.axis.origin;
  if (!Array.isArray(origin) || origin.length !== 3 || origin.some((value) => !Number.isFinite(value) || Math.abs(value) > 1e6)) throw new Error('El origen del eje no es válido.');
  if (!Number.isFinite(feature.angle) || feature.angle <= 0 || feature.angle > 360) throw new Error('El ángulo debe ser mayor que 0° y no superar 360°.');
  if (typeof feature.equalSpacing !== 'boolean' || typeof feature.reversed !== 'boolean') throw new Error('La distribución u orientación circular no es válida.');
  const skipped = new Set<number>();
  for (const index of feature.skipped) {
    if (!Number.isInteger(index) || index < 1 || index >= feature.count || skipped.has(index)) throw new Error('La lista de instancias omitidas contiene un índice inexistente, repetido o la semilla.');
    skipped.add(index);
  }
  const step = feature.equalSpacing ? feature.angle / (feature.angle === 360 ? feature.count : feature.count - 1) : feature.angle;
  const transforms: PatternTransform[] = [], angles = [0];
  for (let index = 1; index < feature.count; index++) {
    if (skipped.has(index)) continue;
    const angle = index * step * (feature.reversed ? -1 : 1), periodic = ((angle % 360) + 360) % 360;
    if (angles.some((previous) => Math.min(Math.abs(previous - periodic), 360 - Math.abs(previous - periodic)) < 1e-8)) {
      throw new Error('La distribución circular repite una orientación existente. Reduce el número, cambia el ángulo u omite la instancia.');
    }
    angles.push(periodic); transforms.push({ key: `${index}`, angle, origin, direction });
  }
  if (!transforms.length) throw new Error('No queda ninguna instancia nueva después de las omisiones.');
  return { transforms, structure: [feature.type, canonical(direction), canonical(origin), feature.count, feature.equalSpacing,
    feature.angle === 360, feature.reversed, [...skipped].sort((a, b) => a - b)] };
}

export function geometryDelta(before: Shape3D | null, after: Shape3D, validate: (shape: Shape3D) => number): GeometryDelta {
  let added: Shape3D | null = null, removed: Shape3D | null = null;
  const useful = (shape: Shape3D) => {
    if (Math.abs(volumeOf(shape)) <= EPS) { shape.delete(); return null; }
    try { validate(shape); return shape; } catch (error) { shape.delete(); throw error; }
  };
  try {
    added = useful(before ? after.cut(before) : after.clone());
    removed = before ? useful(before.cut(after)) : null;
    const afterVolume = volumeOf(after), beforeVolume = before ? volumeOf(before) : 0;
    const difference = (added ? volumeOf(added) : 0) - (removed ? volumeOf(removed) : 0);
    if (Math.abs(afterVolume - beforeVolume - difference) > Math.max(1e-6, Math.abs(afterVolume) * 1e-7)) {
      throw new Error('La semilla contiene cuerpos superpuestos cuyo aporte no se puede separar sin ambigüedad. Usa el modo cuerpo.');
    }
    return { added, removed, dispose() { this.added?.delete(); this.removed?.delete(); this.added = this.removed = null; } };
  } catch (error) { added?.delete(); removed?.delete(); throw error; }
}

function transformed(shape: Shape3D, transform: PatternTransform): Shape3D {
  const copy = shape.clone();
  try {
    if ('translation' in transform) return copy.translate(transform.translation);
    if ('angle' in transform) return copy.rotate(transform.angle, transform.origin, transform.direction);
    return copy.mirror(transform.mirror.normal, transform.mirror.origin);
  } catch (error) { copy.delete(); throw error; }
}
function single(shape: Shape3D, message: string) {
  const solids = shape.solids;
  try { if (solids.length !== 1) throw new Error(message); } finally { solids.forEach((solid) => solid.delete()); }
}
function duplicatesBody(copy: Shape3D, current: Shape3D): boolean {
  const box = copy.boundingBox, target = box.bounds.flat(), volume = volumeOf(copy), solids = current.solids;
  box.delete();
  try {
    return solids.some((solid) => {
      const bounds = solid.boundingBox;
      try { if (bounds.bounds.flat().some((value, axis) => Math.abs(value - target[axis]) > 1e-6)) return false; }
      finally { bounds.delete(); }
      if (Math.abs(volumeOf(solid) - volume) > volumeTolerance(volume)) return false;
      const remainder = copy.cut(solid);
      try { return Math.abs(volumeOf(remainder)) <= volumeTolerance(volume); } finally { remainder.delete(); }
    });
  } finally { solids.forEach((solid) => solid.delete()); }
}

/** Replays only the signed material changes of selected historical features. */
export function repetitionSolid(feature: RepetitionFeature, plan: PatternPlan, base: Shape3D,
  source: { body: Shape3D } | { seeds: FeatureGeometry[] }, validate: (shape: Shape3D) => number): Shape3D {
  if ('seeds' in source) {
    if (!source.seeds.length || source.seeds.length > 32) throw new Error('Selecciona entre 1 y 32 operaciones semilla.');
    if (source.seeds.length * plan.transforms.length > 512) throw new Error('La matriz supera 512 aplicaciones de operaciones semilla. Reduce instancias o semillas.');
    single(base, 'La matriz de operaciones requiere un único cuerpo de partida. Usa el modo cuerpo para piezas multicuerpo.');
    for (const seed of source.seeds) {
      if (seed.error) throw new Error(`No se puede copiar la geometría de la semilla: ${seed.error}`);
      if (!seed.delta || (!seed.delta.added && !seed.delta.removed)) throw new Error('Una operación semilla no tiene aportación geométrica. Recupera la selección.');
    }
  } else single(source.body, 'La semilla de cuerpo debe contener exactamente un sólido histórico.');
  let current: Shape3D = base.clone();
  let transferred = false;
  try {
    for (const transform of plan.transforms) {
      if ('body' in source) {
        const copy = transformed(source.body, transform);
        try {
          validate(copy);
          if (duplicatesBody(copy, current)) throw new Error(`La instancia ${transform.key} coincide con un cuerpo existente. Cambia la transformación.`);
          const merge = feature.type === 'mirror' && feature.mergeBodies;
          const candidate: Shape3D = merge ? current.fuse(copy) : makeCompound([current, copy]).asShape3D();
          try {
            validate(candidate);
            if (merge) single(candidate, 'No se pueden fusionar los cuerpos de la simetría porque no están conectados.');
          } catch (error) { candidate.delete(); throw error; }
          current.delete(); current = candidate;
        } finally { copy.delete(); }
      } else {
        for (const seed of [...source.seeds].sort((a, b) => a.order - b.order)) {
          for (const effect of ['removed', 'added'] as const) {
            const geometry = seed.delta![effect];
            if (!geometry) continue;
            const tool = transformed(geometry, transform);
            try {
              validate(tool);
              const previousVolume = volumeOf(current);
              const candidate: Shape3D = effect === 'removed' ? current.cut(tool) : current.fuse(tool);
              try {
                const nextVolume = validate(candidate);
                const changed = effect === 'removed' ? previousVolume - nextVolume : nextVolume - previousVolume;
                if (changed <= volumeTolerance(previousVolume)) throw new Error(`La instancia ${transform.key} de una semilla no modifica material. Revisa la dirección, separación u omisiones.`);
                single(candidate, 'La matriz de operaciones debe seguir conectada en un único sólido. Usa el modo cuerpo para copias separadas.');
              } catch (error) { candidate.delete(); throw error; }
              current.delete(); current = candidate;
            } finally { tool.delete(); }
          }
        }
      }
    }
    transferred = true; return current;
  } finally { if (!transferred) current.delete(); }
}
