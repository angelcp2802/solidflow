import { cast, getOC, makeCompound, type Shape3D } from 'replicad';
import type { BodyReference, CombineFeature } from './kernel.types';
import { advanceLineage } from './kernel.naming';

const MAX_BODIES = 256;
const OWNED_TRANSFER = Symbol('validated-body-transfer');
type NativeOwner = { delete(): void };

/** Saved identity and current state; none of these fields is derived from solid enumeration. */
export interface NativeBodyMetadata {
  readonly ref: Readonly<BodyReference>;
  readonly createdByFeatureId: string;
  readonly name: string;
  readonly lineage: string;
}

/** The shape is borrowed from the catalog/transaction. Consumers must not delete or mutate it. */
export interface NativeBodyEntry extends NativeBodyMetadata {
  readonly shape: Shape3D;
}

export interface NativeBodyStateUpdate {
  readonly sourceFeatureId: string;
  readonly lineage: string;
  readonly name?: string;
}

export interface NativeBodyReplacement {
  readonly ref: BodyReference;
  /** Borrowed; the transaction makes its own copy. */
  readonly shape: Shape3D;
}

function id(value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 128 || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error('La identidad de cuerpo u operación debe tener entre 1 y 128 caracteres sin controles.');
  }
}

function reference(ref: BodyReference): void {
  if (!ref || typeof ref !== 'object') throw new Error('Referencia de cuerpo no válida.');
  id(ref.bodyId); id(ref.sourceFeatureId);
}

function metadata(value: NativeBodyMetadata): NativeBodyMetadata {
  reference(value.ref); id(value.createdByFeatureId);
  if (typeof value.name !== 'string' || typeof value.lineage !== 'string') throw new Error('Metadatos de cuerpo no válidos.');
  return Object.freeze({ ref: Object.freeze({ ...value.ref }), createdByFeatureId: value.createdByFeatureId,
    name: value.name, lineage: value.lineage });
}

function updated(entry: NativeBodyEntry, update: NativeBodyStateUpdate): NativeBodyMetadata {
  id(update.sourceFeatureId);
  if (typeof update.lineage !== 'string' || (update.name !== undefined && typeof update.name !== 'string')) {
    throw new Error('Estado de cuerpo no válido.');
  }
  return metadata({ ...entry, ref: { bodyId: entry.ref.bodyId, sourceFeatureId: update.sourceFeatureId },
    name: update.name ?? entry.name,
    lineage: advanceLineage(entry.lineage, [update.lineage, update.sourceFeatureId, entry.ref.bodyId, 'scoped']) });
}

function entry(value: NativeBodyMetadata, shape: Shape3D): NativeBodyEntry {
  return Object.freeze({ ...metadata(value), shape });
}

function combinedFailure(failure: unknown, cleanup: readonly unknown[], message: string): never {
  if (!cleanup.length) throw failure;
  throw new AggregateError([failure, ...cleanup], message);
}

/** Each explicit owner receives at most one release attempt, including on exceptions. */
class Owners {
  private readonly values = new Set<NativeOwner>();
  own<T extends NativeOwner>(value: T): T { this.values.add(value); return value; }
  transfer(value: NativeOwner): void { this.values.delete(value); }
  release(value: NativeOwner): void {
    if (!this.values.delete(value)) return;
    value.delete();
  }
  releaseExcept(keep: ReadonlySet<NativeOwner> = new Set()): unknown[] {
    const errors: unknown[] = [];
    for (const value of [...this.values].reverse()) {
      if (keep.has(value)) continue;
      try { this.release(value); } catch (error) { errors.push(error); }
    }
    return errors;
  }
}

function withOwners<T>(operation: (owners: Owners) => T): T {
  const owners = new Owners();
  let result: T;
  try { result = operation(owners); }
  catch (error) { return combinedFailure(error, owners.releaseExcept(), 'Falló la operación o la liberación de cuerpos.'); }
  const errors = owners.releaseExcept();
  if (errors.length) throw new AggregateError(errors, 'Falló la liberación de una comprobación de cuerpos.');
  return result;
}

function ownedShapeOperation(operation: (owners: Owners) => Shape3D): Shape3D {
  const owners = new Owners();
  try {
    const result = operation(owners), errors = owners.releaseExcept(new Set([result]));
    if (errors.length) throw new AggregateError(errors, 'Falló la liberación de una operación de cuerpos.');
    owners.transfer(result);
    return result;
  } catch (error) {
    return combinedFailure(error, owners.releaseExcept(), 'Falló la operación o la liberación de cuerpos.');
  }
}

/** Owned result, borrowed operands. Safe-processing mode is enabled before any Boolean build. */
export function bodyBoolean(operation: 'add' | 'subtract' | 'common', body: Shape3D, tool: Shape3D): Shape3D {
  if (!['add', 'subtract', 'common'].includes(operation)) throw new Error('Operación de cuerpos desconocida.');
  return ownedShapeOperation(owners => {
    const oc = getOC(), argumentsList = owners.own(new oc.NCollection_List_TopoDS_Shape()),
      tools = owners.own(new oc.NCollection_List_TopoDS_Shape());
    const builder = owners.own(operation === 'add' ? new oc.BRepAlgoAPI_Fuse()
      : operation === 'common' ? new oc.BRepAlgoAPI_Common() : new oc.BRepAlgoAPI_Cut());
    argumentsList.Append(body.wrapped); tools.Append(tool.wrapped);
    builder.SetArguments(argumentsList); builder.SetTools(tools);
    builder.SetNonDestructive(true);
    if (!builder.NonDestructive()) throw new Error('No se pudo activar el modo no destructivo de la operación.');
    builder.Build();
    if (!builder.IsDone()) throw new Error('La operación de cuerpos no se pudo completar.');
    // Preserve Replicad's simplification settings; this does not widen geometric acceptance.
    builder.SimplifyResult(true, true, .001);
    const raw = owners.own(builder.Shape());
    if (raw.IsNull()) throw new Error('La operación de cuerpos produce geometría vacía.');
    // cast owns a second downcast wrapper; do not additionally own its wrapped value.
    return owners.own(cast(raw)).asShape3D();
  });
}

/**
 * Owned geometric duplicate for consumers that may modify native input topology.
 * Identity transform with copyGeom=true duplicates even a direct isometry;
 * Shape.clone() alone only supplies another wrapper around shared topology.
 */
export function copyBodyShape(body: Shape3D): Shape3D {
  return ownedShapeOperation(owners => {
    const oc = getOC(), identity = owners.own(new oc.gp_Trsf()),
      builder = owners.own(new oc.BRepBuilderAPI_Transform(body.wrapped, identity, true, false));
    if (!builder.IsDone()) throw new Error('No se pudo duplicar la geometría del cuerpo.');
    const raw = owners.own(builder.Shape());
    if (raw.IsNull() || raw.IsSame(body.wrapped)) throw new Error('La copia del cuerpo no tiene topología independiente.');
    return owners.own(cast(raw)).asShape3D();
  });
}

function volume(shape: Shape3D, owners: Owners): number {
  const oc = getOC(), mass = owners.own(new oc.GProp_GProps());
  oc.BRepGProp.VolumeProperties(shape.wrapped, mass, 1e-10, false, false);
  const value = mass.Mass();
  owners.release(mass);
  return value;
}

function validBRep(shape: Shape3D, owners: Owners): number {
  if (shape.isNull) throw new Error('El cuerpo no contiene geometría.');
  const oc = getOC(), analyzer = owners.own(new oc.BRepCheck_Analyzer(shape.wrapped, true, false, false));
  if (!analyzer.IsValid()) throw new Error('El cuerpo no es un BRep válido.');
  owners.release(analyzer);
  const value = volume(shape, owners);
  if (!Number.isFinite(value) || value <= 1e-10) throw new Error('El cuerpo está vacío o tiene volumen no válido.');
  return value;
}

/** Solid traversal verifies cardinality/closure only; it never assigns or resolves identity. */
export function validateBodyShape(shape: Shape3D): number {
  return withOwners(owners => {
    const oc = getOC(), value = validBRep(shape, owners), solids = shape.solids;
    solids.forEach(solid => owners.own(solid));
    if (solids.length !== 1) throw new Error('Cada entrada requiere exactamente un sólido cerrado; los resultados divididos no se admiten todavía.');
    const shells = owners.own(new oc.TopExp_Explorer(solids[0].wrapped,
      oc.TopAbs_ShapeEnum.TopAbs_SHELL, oc.TopAbs_ShapeEnum.TopAbs_SHAPE));
    let count = 0;
    while (shells.More()) {
      const shell = owners.own(shells.Current());
      if (!oc.BRep_Tool.IsClosed(shell)) throw new Error('El cuerpo contiene una envolvente abierta.');
      owners.release(shell); count++; shells.Next();
    }
    if (!count) throw new Error('El cuerpo no tiene una envolvente cerrada.');
    for (const kind of ['SHELL', 'FACE', 'WIRE', 'EDGE', 'VERTEX'] as const) {
      const loose = owners.own(new oc.TopExp_Explorer(shape.wrapped,
        oc.TopAbs_ShapeEnum[`TopAbs_${kind}`], oc.TopAbs_ShapeEnum.TopAbs_SOLID));
      if (loose.More()) throw new Error('El cuerpo contiene geometría suelta fuera de su sólido.');
      owners.release(loose);
    }
    return value;
  });
}

function validateAggregate(shape: Shape3D, count: number): void {
  withOwners(owners => {
    validBRep(shape, owners);
    const solids = shape.solids;
    solids.forEach(solid => owners.own(solid));
    if (solids.length !== count) throw new Error('El agregado no conserva todos los cuerpos del catálogo.');
  });
}

function changed(before: number, after: number): void {
  if (before - after <= Math.max(1e-9, before * 1e-10)) {
    throw new Error('El corte no elimina material de cada cuerpo seleccionado.');
  }
}

/** Owns an uncommitted detached state. No action mutates its source catalog. */
export class NativeBodyTransaction {
  private active = true;
  private readonly owners = new Owners();
  readonly nextEntries: readonly NativeBodyEntry[];
  /** Borrowed until commit transfers it to the caller. */
  readonly aggregate: Shape3D;

  constructor(entries: readonly NativeBodyEntry[], aggregate: Shape3D, transfer: typeof OWNED_TRANSFER) {
    if (transfer !== OWNED_TRANSFER) throw new Error('Transferencia de cuerpos no autorizada.');
    this.nextEntries = Object.freeze([...entries]); this.aggregate = aggregate;
    entries.forEach(item => this.owners.own(item.shape)); this.owners.own(aggregate);
  }

  /** Caller owns both results separately and must explicitly retire its previous catalog/body. */
  commit(): { catalog: NativeBodyCatalog; aggregate: Shape3D } {
    if (!this.active) throw new Error('La propuesta de cuerpos ya se confirmó o descartó.');
    const catalog = NativeBodyCatalog.fromOwned(this.nextEntries, OWNED_TRANSFER);
    this.active = false;
    this.nextEntries.forEach(item => this.owners.transfer(item.shape)); this.owners.transfer(this.aggregate);
    return { catalog, aggregate: this.aggregate };
  }

  dispose(): void {
    if (!this.active) return;
    this.active = false;
    const errors = this.owners.releaseExcept();
    if (errors.length) throw new AggregateError(errors, 'Falló la liberación de la propuesta de cuerpos.');
  }
}

/** Current exact body states. Legacy aggregate reconstruction does not use this catalog. */
export class NativeBodyCatalog {
  private disposed = false;
  private readonly owners = new Owners();
  private values: readonly NativeBodyEntry[] = Object.freeze([]);

  /** Internal transfer: entries have already been validated and are uniquely owned. */
  static fromOwned(entries: readonly NativeBodyEntry[], transfer: typeof OWNED_TRANSFER): NativeBodyCatalog {
    if (transfer !== OWNED_TRANSFER) throw new Error('Transferencia de cuerpos no autorizada.');
    const result = new NativeBodyCatalog();
    result.values = Object.freeze([...entries]);
    entries.forEach(item => result.owners.own(item.shape));
    return result;
  }

  private available(): void { if (this.disposed) throw new Error('El catálogo de cuerpos ya se liberó.'); }
  entries(): readonly NativeBodyEntry[] { this.available(); return this.values; }

  resolve(ref: BodyReference): NativeBodyEntry {
    this.available(); reference(ref);
    const found = this.values.find(item => item.ref.bodyId === ref.bodyId);
    if (!found || found.ref.sourceFeatureId !== ref.sourceFeatureId) {
      throw new Error('El cuerpo seleccionado está ausente, consumido, suprimido o pertenece a otro estado. Recupera la selección.');
    }
    return found;
  }

  private selected(refs: readonly BodyReference[], minimum = 1): NativeBodyEntry[] {
    this.available();
    if (!Array.isArray(refs) || refs.length < minimum || refs.length > MAX_BODIES) {
      throw new Error(`Selecciona entre ${minimum} y ${MAX_BODIES} cuerpos.`);
    }
    const result: NativeBodyEntry[] = [], seen = new Set<string>();
    for (let i = 0; i < refs.length; i++) {
      if (!(i in refs)) throw new Error('La selección de cuerpos contiene posiciones vacías.');
      const found = this.resolve(refs[i]);
      if (seen.has(found.ref.bodyId)) throw new Error('Un cuerpo no puede aparecer dos veces en la operación.');
      seen.add(found.ref.bodyId); result.push(found);
    }
    return result;
  }

  private stage(build: (owners: Owners) => NativeBodyEntry[]): NativeBodyTransaction {
    this.available();
    const owners = new Owners();
    try {
      const next = build(owners);
      if (next.length < 1 || next.length > MAX_BODIES) throw new Error('El catálogo admite entre 1 y 256 cuerpos activos.');
      const identities = new Set<string>(), wrappers = new Set<Shape3D>();
      for (const item of next) {
        metadata(item);
        if (identities.has(item.ref.bodyId) || wrappers.has(item.shape)) throw new Error('Las entradas del catálogo deben tener identidades y propietarios distintos.');
        identities.add(item.ref.bodyId); wrappers.add(item.shape); validateBodyShape(item.shape);
      }
      // The aggregate has its own wrapper and cloned children. It is never an implicit union.
      const children = next.map(item => owners.own(item.shape.clone()));
      const aggregate = owners.own(makeCompound(children)).asShape3D();
      validateAggregate(aggregate, next.length);
      const keep = new Set<NativeOwner>([...next.map(item => item.shape), aggregate]);
      const errors = owners.releaseExcept(keep);
      if (errors.length) throw new AggregateError(errors, 'Falló la liberación de candidatos intermedios.');
      const transaction = new NativeBodyTransaction(next, aggregate, OWNED_TRANSFER);
      keep.forEach(item => owners.transfer(item));
      return transaction;
    } catch (error) {
      return combinedFailure(error, owners.releaseExcept(), 'Falló la propuesta o la liberación de cuerpos.');
    }
  }

  stageNew(value: NativeBodyMetadata, borrowedShape: Shape3D): NativeBodyTransaction {
    this.available(); const source = metadata(value);
    if (this.values.length >= MAX_BODIES) throw new Error('El catálogo admite como máximo 256 cuerpos activos.');
    if (this.values.some(item => item.ref.bodyId === source.ref.bodyId)) throw new Error('La identidad del nuevo cuerpo ya existe.');
    return this.stage(owners => [...this.values.map(item => entry(item, owners.own(item.shape.clone()))),
      entry({ ...source, lineage: advanceLineage(source.lineage, [source.ref.bodyId, 'new']) }, owners.own(copyBodyShape(borrowedShape)))]);
  }

  /** All copies are validated and transferred together; the source catalog stays borrowed. */
  stageNewMany(additions: readonly { metadata: NativeBodyMetadata; shape: Shape3D }[]): NativeBodyTransaction {
    this.available();
    if (!Array.isArray(additions) || additions.length < 1 || additions.length > MAX_BODIES
      || this.values.length + additions.length > MAX_BODIES) {
      throw new Error('Las copias superan el límite de 256 cuerpos activos.');
    }
    const identities = new Set(this.values.map(item => item.ref.bodyId));
    const sources: NativeBodyMetadata[] = [];
    for (let index = 0; index < additions.length; index++) {
      if (!Object.hasOwn(additions, index)) throw new Error('La lista de copias contiene posiciones vacías.');
      const source = metadata(additions[index]?.metadata);
      if (identities.has(source.ref.bodyId)) throw new Error('La identidad de una copia de cuerpo ya existe.');
      if (!additions[index].shape || typeof additions[index].shape.clone !== 'function') throw new Error('Una copia no contiene geometría de cuerpo.');
      identities.add(source.ref.bodyId); sources.push(source);
    }
    return this.stage(owners => [
      ...this.values.map(item => entry(item, owners.own(item.shape.clone()))),
      ...sources.map((source, index) => entry({ ...source,
        lineage: advanceLineage(source.lineage, [source.ref.bodyId, 'new']) },
      owners.own(copyBodyShape(additions[index].shape)))),
    ]);
  }

  /** Only the final union must be connected: a later copy may bridge earlier islands. */
  stageMergeMany(ref: BodyReference, borrowedTools: readonly Shape3D[], update: NativeBodyStateUpdate): NativeBodyTransaction {
    const selected = this.resolve(ref), state = updated(selected, update);
    if (!Array.isArray(borrowedTools) || borrowedTools.length < 1 || borrowedTools.length > 512) {
      throw new Error('Selecciona entre 1 y 512 copias para añadir material.');
    }
    for (let index = 0; index < borrowedTools.length; index++) {
      if (!Object.hasOwn(borrowedTools, index)) throw new Error('La lista de copias contiene posiciones vacías.');
      validateBodyShape(borrowedTools[index]);
    }
    return this.stage(owners => {
      let result = owners.own(selected.shape.clone());
      for (const borrowed of borrowedTools) {
        const tool = owners.own(borrowed.clone()), next = owners.own(bodyBoolean('add', result, tool));
        if (next === result || next === tool) throw new Error('La unión de copias no tiene un propietario independiente.');
        owners.release(result); owners.release(tool); result = next;
      }
      validateBodyShape(result);
      return this.values.map(item => item === selected
        ? entry(state, owners.own(copyBodyShape(result)))
        : entry(item, owners.own(item.shape.clone())));
    });
  }

  stageMerge(ref: BodyReference, borrowedTool: Shape3D, update: NativeBodyStateUpdate): NativeBodyTransaction {
    const selected = this.resolve(ref), state = updated(selected, update);
    return this.stage(owners => {
      const tool = owners.own(borrowedTool.clone());
      return this.values.map(item => {
        const copied = owners.own(item.shape.clone());
        if (item !== selected) return entry(item, copied);
        const result = owners.own(bodyBoolean('add', copied, tool));
        return entry(state, owners.own(copyBodyShape(result)));
      });
    });
  }

  stageScopedCut(refs: readonly BodyReference[], borrowedTool: Shape3D, update: NativeBodyStateUpdate): NativeBodyTransaction {
    const selected = new Set(this.selected(refs)), states = new Map([...selected].map(item => [item, updated(item, update)]));
    return this.stage(owners => {
      const tool = owners.own(borrowedTool.clone());
      return this.values.map(item => {
        const copied = owners.own(item.shape.clone());
        if (!selected.has(item)) return entry(item, copied);
        const result = owners.own(bodyBoolean('subtract', copied, tool));
        changed(validateBodyShape(item.shape), validateBodyShape(result));
        return entry(states.get(item)!, owners.own(copyBodyShape(result)));
      });
    });
  }

  stageReplace(ref: BodyReference, borrowedCandidate: Shape3D, update: NativeBodyStateUpdate): NativeBodyTransaction {
    return this.stageReplaceMany([{ ref, shape: borrowedCandidate }], update);
  }

  stageReplaceMany(replacements: readonly NativeBodyReplacement[], update: NativeBodyStateUpdate): NativeBodyTransaction {
    if (!Array.isArray(replacements)) throw new Error('La sustitución de cuerpos no es válida.');
    const selected = this.selected(replacements.map(item => item?.ref)),
      states = new Map(selected.map(item => [item, updated(item, update)])),
      candidates = new Map(selected.map((item, index) => [item, replacements[index].shape]));
    for (const candidate of candidates.values()) {
      if (!candidate || typeof candidate.clone !== 'function') throw new Error('La sustitución requiere un candidato de cuerpo.');
    }
    return this.stage(owners => this.values.map(item => entry(states.get(item) ?? item,
      owners.own(candidates.has(item) ? copyBodyShape(candidates.get(item)!) : item.shape.clone()))));
  }

  stageCombine(feature: CombineFeature, lineage: string): NativeBodyTransaction {
    this.available(); id(feature.id);
    if (feature.suppressed || typeof feature.keepTools !== 'boolean' || typeof feature.name !== 'string' || typeof lineage !== 'string') {
      throw new Error('La operación Combinar no está disponible o sus parámetros no son válidos.');
    }
    if (!['add', 'subtract', 'common'].includes(feature.operation)) throw new Error('Operación Combinar desconocida.');
    const operands = feature.operation === 'subtract'
      ? this.selected([feature.target, ...feature.tools], 2) : this.selected(feature.operands, 2);
    const subtract = feature.operation === 'subtract', target = operands[0];
    const bodyId = subtract ? target.ref.bodyId : (feature as Extract<CombineFeature, { operation: 'add' | 'common' }>).resultBodyId;
    id(bodyId);
    if (!subtract && this.values.some(item => item.ref.bodyId === bodyId)) throw new Error('El resultado de unión o intersección requiere una nueva identidad de cuerpo.');
    const consumed = new Set(feature.keepTools ? (subtract ? [target] : []) : operands);
    if (this.values.length - consumed.size + 1 > MAX_BODIES) throw new Error('Combinar supera el límite de 256 cuerpos activos.');
    const state = metadata({ ref: { bodyId, sourceFeatureId: feature.id },
      createdByFeatureId: subtract ? target.createdByFeatureId : feature.id, name: feature.name,
      lineage: advanceLineage(lineage, ['combine', feature.id, feature.operation, feature.keepTools, bodyId,
        operands.map(item => [item.ref.bodyId, item.ref.sourceFeatureId, item.lineage])]) });
    return this.stage(owners => {
      let result = owners.own(target.shape.clone());
      for (const operand of operands.slice(1)) {
        const tool = owners.own(operand.shape.clone());
        const next = owners.own(bodyBoolean(feature.operation, result, tool));
        if (next === result || next === tool) throw new Error('El resultado booleano no tiene un propietario independiente.');
        owners.release(result); owners.release(tool); result = next;
      }
      const finalVolume = validateBodyShape(result);
      if (subtract) changed(validateBodyShape(target.shape), finalVolume);
      const next = this.values.filter(item => !consumed.has(item)).map(item => entry(item, owners.own(item.shape.clone())));
      next.push(entry(state, owners.own(copyBodyShape(result))));
      return next;
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const errors = this.owners.releaseExcept(); this.values = Object.freeze([]);
    if (errors.length) throw new AggregateError(errors, 'Falló la liberación del catálogo de cuerpos.');
  }
}
