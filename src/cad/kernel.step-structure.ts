import type { Vec3 } from './kernel.types';
import { composeRigidPoses, inverseRigidPose, validateRigidPose, type Quaternion, type RigidPose } from '../model/rigidPose';
import { isStepRef, isStepText, parseStepPart21, type StepCall, type StepRecord, type StepValue } from './kernel.step-part21';
import { stepLengthUnit } from './kernel.step-units';

export interface StepAssemblyOccurrence { id: string; name: string; definition: string; pose: RigidPose }
export interface StepAssemblyDefinition {
  /** Canonical decimal PRODUCT_DEFINITION entity label, without '#'. */
  id: string;
  name: string;
  /** Canonical decimal shape-representation label for a separate native transfer. */
  representation: string;
  kind: 'part' | 'assembly';
  /** Direct native MANIFOLD_SOLID_BREP labels; empty for assemblies. */
  solids: string[];
  occurrences: StepAssemblyOccurrence[];
}
export interface StepAssemblyStructure { root: string; definitions: StepAssemblyDefinition[] }

const MAX_DEFINITIONS = 512, MAX_EXPANDED_OCCURRENCES = 4096, MAX_EXPANDED_SOLIDS = 4096, MAX_PART_SOLIDS = 256, MAX_DEPTH = 32;
function invalid(message: string): never { throw new Error(`STEP estructura: ${message}`); }
function text(value: StepValue | undefined): string {
  if (!isStepText(value) || value.text.length > 4096 || /[\u0000-\u001f\u007f]/.test(value.text)) invalid('texto de producto o instancia no admitido.');
  return value.text;
}
function optionalText(value: StepValue | undefined): void { if (value !== '$') text(value); }
function reference(value: StepValue | undefined): string {
  if (!isStepRef(value)) invalid('se requiere una referencia de entidad explícita.');
  return value.ref;
}
function references(value: StepValue | undefined): string[] {
  if (!Array.isArray(value) || !value.length) invalid('lista de referencias vacía o no válida.');
  const out = value.map(reference);
  if (new Set(out).size !== out.length) invalid('referencias repetidas dentro de una representación.');
  return out;
}
function vector(value: StepValue | undefined): Vec3 {
  if (!Array.isArray(value) || value.length !== 3 || !value.every(v => typeof v === 'number' && Number.isFinite(v))) invalid('se requiere un vector tridimensional finito.');
  return [...value] as Vec3;
}
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
function unit(v: Vec3): Vec3 {
  // Ratios need not already be unit length. Scaling first avoids an overflowing
  // norm or a rounded subnormal norm turning a proper frame into a skew matrix.
  const scale = Math.max(...v.map(Math.abs));
  if (!Number.isFinite(scale) || scale === 0) invalid('dirección nula o no representable.');
  const scaled = v.map(x => x / scale) as Vec3, n = Math.hypot(...scaled);
  const out = scaled.map(x => x / n) as Vec3;
  if (!out.every(Number.isFinite)) invalid('dirección no representable.');
  return out;
}
/** Columns x,y,z form a proper frame; no scale, reflection or guessed default axis. */
function quaternion(x: Vec3, y: Vec3, z: Vec3): Quaternion {
  const m = [x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2]], trace = m[0] + m[4] + m[8];
  let q: Quaternion;
  if (trace > 0) {
    const s = 2 * Math.sqrt(1 + trace);
    q = [(m[7] - m[5]) / s, (m[2] - m[6]) / s, (m[3] - m[1]) / s, s / 4];
  } else {
    const i = m[0] >= m[4] && m[0] >= m[8] ? 0 : m[4] >= m[8] ? 1 : 2, j = (i + 1) % 3, k = (i + 2) % 3;
    const s = 2 * Math.sqrt(1 + m[3 * i + i] - m[3 * j + j] - m[3 * k + k]);
    q = [0, 0, 0, (m[3 * k + j] - m[3 * j + k]) / s];
    q[i] = s / 4; q[j] = (m[3 * j + i] + m[3 * i + j]) / s; q[k] = (m[3 * k + i] + m[3 * i + k]) / s;
  }
  const n = Math.hypot(...q);
  return q.map(v => v / n) as Quaternion;
}

/**
 * Explicit AP242 bounded-solid-product profile: PD/SDR, NAUO/CDSR and the
 * three-component RRWT + ITEM_DEFINED_TRANSFORMATION with explicit 3D frames.
 * This reads structure, not EXPRESS validity, native BRep validity or mate data.
 * Field roles and frame direction follow OCCT STEPConstruct_Assembly::MakeRelationship
 * and STEPControl_ActorRead::ComputeSRRWT/ComputeTransformation. Reversed relations,
 * mapped items, alternative representations and implicit frame axes fail closed.
 */
export function readStepAssemblyStructure(bytes: Uint8Array): StepAssemblyStructure {
  const { records, header } = parseStepPart21(bytes), scale = stepLengthUnit(bytes).millimetersPerUnit;
  const schemas = header.filter(c => c.name === 'FILE_SCHEMA');
  const schema = schemas[0]?.args[0];
  if (schemas.length !== 1 || schemas[0].args.length !== 1 || !Array.isArray(schema) || schema.length !== 1
    || !isStepText(schema[0]) || !/^AP242_MANAGED_MODEL_BASED_3D_ENGINEERING_MIM_LF(?: \{[0-9 ]+\})?$/i.test(schema[0].text.trim())) {
    invalid('sólo se admite el perfil estructural AP242 explícito.');
  }
  const byType = new Map<string, string[]>();
  for (const [id, record] of records) for (const c of record.components) {
    const list = byType.get(c.name) ?? []; list.push(id); byType.set(c.name, list);
    if (c.name.includes('EXTERNAL') || c.name === 'DOCUMENT_FILE' || c.name === 'MAPPED_ITEM' || c.name === 'REPRESENTATION_MAP'
      || c.name.startsWith('CARTESIAN_TRANSFORMATION_OPERATOR')
      || c.name.endsWith('SHAPE_REPRESENTATION') && !['SHAPE_REPRESENTATION', 'ADVANCED_BREP_SHAPE_REPRESENTATION', 'CONTEXT_DEPENDENT_SHAPE_REPRESENTATION'].includes(c.name)
      || (c.name.includes('ASSEMBLY_USAGE') || c.name.includes('ASSEMBLY_COMPONENT_USAGE') || c.name.endsWith('USAGE_OCCURRENCE')) && c.name !== 'NEXT_ASSEMBLY_USAGE_OCCURRENCE'
      || c.name.includes('REPRESENTATION_RELATIONSHIP') && !['REPRESENTATION_RELATIONSHIP', 'REPRESENTATION_RELATIONSHIP_WITH_TRANSFORMATION', 'SHAPE_REPRESENTATION_RELATIONSHIP'].includes(c.name)
      || c.name === 'MECHANICAL_DESIGN_AND_DRAUGHTING_RELATIONSHIP' || c.name === 'PRODUCT_DEFINITION_RELATIONSHIP') invalid(`entidad estructural no admitida: ${c.name}.`);
  }
  const ids = (name: string) => byType.get(name) ?? [];
  const record = (id: string): StepRecord => records.get(id) ?? invalid(`referencia inexistente #${id}.`);
  const component = (id: string, name: string, count: number, simple = true): StepCall => {
    const r = record(id), c = r.components.find(v => v.name === name);
    if (!c || c.args.length !== count || simple && r.components.length !== 1) invalid(`#${id}: se requiere ${name} con ${count} atributos.`);
    return c;
  };
  const linked = (value: StepValue | undefined, name: string, count: number) => component(reference(value), name, count);
  const frame = (id: string): RigidPose => {
    const a = component(id, 'AXIS2_PLACEMENT_3D', 4); text(a.args[0]);
    const p = linked(a.args[1], 'CARTESIAN_POINT', 2), d = linked(a.args[2], 'DIRECTION', 2), r = linked(a.args[3], 'DIRECTION', 2);
    text(p.args[0]); text(d.args[0]); text(r.args[0]);
    const position = vector(p.args[1]), z = unit(vector(d.args[1])), rawX = unit(vector(r.args[1]));
    const parallel = dot(rawX, z), projected = rawX.map((v, i) => v - parallel * z[i]) as Vec3;
    // Arithmetic conditioning only; no uncertainty or physical precision is inferred.
    if (Math.hypot(...projected) <= 1e-12) invalid('ejes de colocación paralelos o mal condicionados.');
    const y = unit(cross(z, projected)), x = unit(cross(y, z));
    return validateRigidPose({ translation: position.map(v => v * scale), rotation: quaternion(x, y, z) });
  };

  const definitions = new Map<string, StepAssemblyDefinition>(), representations = new Map<string, { definition: string; items: string[] }>();
  const usedProducts = new Set<string>(), usedFormations = new Set<string>(), usedPds = new Set<string>(), usedSdr = new Set<string>(), usedSolids = new Set<string>();
  const pdIds = ids('PRODUCT_DEFINITION');
  if (!pdIds.length || pdIds.length > MAX_DEFINITIONS) invalid('se requieren entre 1 y 512 definiciones.');
  const sdrByPd = new Map<string, { id: string; pds: string; representation: string }>();
  for (const id of ids('SHAPE_DEFINITION_REPRESENTATION')) {
    const sdr = component(id, 'SHAPE_DEFINITION_REPRESENTATION', 2), pdsId = reference(sdr.args[0]), pds = component(pdsId, 'PRODUCT_DEFINITION_SHAPE', 3);
    text(pds.args[0]); optionalText(pds.args[1]);
    const pdId = reference(pds.args[2]);
    component(pdId, 'PRODUCT_DEFINITION', 4);
    if (sdrByPd.has(pdId) || usedPds.has(pdsId)) invalid('definición con representaciones alternativas o ambiguas.');
    sdrByPd.set(pdId, { id, pds: pdsId, representation: reference(sdr.args[1]) }); usedPds.add(pdsId); usedSdr.add(id);
  }
  for (const id of pdIds) {
    const pd = component(id, 'PRODUCT_DEFINITION', 4); text(pd.args[0]); optionalText(pd.args[1]);
    const formationId = reference(pd.args[2]), formation = component(formationId, 'PRODUCT_DEFINITION_FORMATION', 3);
    text(formation.args[0]); optionalText(formation.args[1]);
    const productId = reference(formation.args[2]), product = component(productId, 'PRODUCT', 4);
    text(product.args[0]); const name = text(product.args[1]); optionalText(product.args[2]);
    for (const contextId of references(product.args[3])) component(contextId, 'PRODUCT_CONTEXT', 3);
    component(reference(pd.args[3]), 'PRODUCT_DEFINITION_CONTEXT', 3);
    if (usedProducts.has(productId) || usedFormations.has(formationId)) invalid('producto o formación con múltiples definiciones no admitidos.');
    usedProducts.add(productId); usedFormations.add(formationId);
    const association = sdrByPd.get(id) ?? invalid(`#${id}: falta una representación de producto.`), repId = association.representation, rep = record(repId);
    const c = rep.components[0];
    if (rep.components.length !== 1 || !c || !['SHAPE_REPRESENTATION', 'ADVANCED_BREP_SHAPE_REPRESENTATION'].includes(c.name) || c.args.length !== 3) invalid('representación de producto no admitida.');
    text(c.args[0]); reference(c.args[2]);
    if (representations.has(repId)) invalid('una representación no puede definir dos productos.');
    const items = references(c.args[1]), solids: string[] = [];
    for (const item of items) {
      const r = record(item);
      if (r.components.length === 1 && r.components[0].name === 'AXIS2_PLACEMENT_3D') frame(item);
      else {
        const solid = component(item, 'MANIFOLD_SOLID_BREP', 2); text(solid.args[0]); linked(solid.args[1], 'CLOSED_SHELL', 2);
        if (solids.length >= MAX_PART_SOLIDS) invalid('cada producto pieza admite como máximo 256 sólidos directos.');
        usedSolids.add(item); solids.push(item);
      }
    }
    // CAF emits SHAPE_REPRESENTATION for a multibody leaf as well as for
    // assemblies. Direct material solids, not that type name, distinguish it.
    if (c.name === 'ADVANCED_BREP_SHAPE_REPRESENTATION' && !solids.length) invalid('una representación BRep de pieza requiere entre 1 y 256 sólidos directos.');
    const kind = solids.length ? 'part' : 'assembly';
    representations.set(repId, { definition: id, items });
    definitions.set(id, { id, name, representation: repId, kind, solids, occurrences: [] });
  }
  if (usedProducts.size !== ids('PRODUCT').length || usedFormations.size !== ids('PRODUCT_DEFINITION_FORMATION').length
    || usedSdr.size !== pdIds.length || representations.size !== ids('SHAPE_REPRESENTATION').length + ids('ADVANCED_BREP_SHAPE_REPRESENTATION').length
    || usedSolids.size !== ids('MANIFOLD_SOLID_BREP').length) invalid('productos o representaciones sin asociación única.');

  const placementByUse = new Map<string, { relationship: string; pds: string }>(), usedRelations = new Set<string>(), usedTransforms = new Set<string>();
  for (const id of ids('CONTEXT_DEPENDENT_SHAPE_REPRESENTATION')) {
    const cdsr = component(id, 'CONTEXT_DEPENDENT_SHAPE_REPRESENTATION', 2), pdsId = reference(cdsr.args[1]), pds = component(pdsId, 'PRODUCT_DEFINITION_SHAPE', 3);
    text(pds.args[0]); optionalText(pds.args[1]);
    const useId = reference(pds.args[2]); component(useId, 'NEXT_ASSEMBLY_USAGE_OCCURRENCE', 6);
    if (placementByUse.has(useId) || usedPds.has(pdsId)) invalid('colocación de instancia repetida o ambigua.');
    placementByUse.set(useId, { relationship: reference(cdsr.args[0]), pds: pdsId }); usedPds.add(pdsId);
  }
  const incoming = new Set<string>();
  for (const id of ids('NEXT_ASSEMBLY_USAGE_OCCURRENCE')) {
    const use = component(id, 'NEXT_ASSEMBLY_USAGE_OCCURRENCE', 6); text(use.args[0]); const name = text(use.args[1]); optionalText(use.args[2]); optionalText(use.args[5]);
    const parentId = reference(use.args[3]), childId = reference(use.args[4]), parent = definitions.get(parentId), child = definitions.get(childId);
    if (!parent || !child) invalid('referencia padre/hijo de instancia no válida.');
    if (parent.kind !== 'assembly') invalid('un producto no puede mezclar sólidos directos e instancias hijas.');
    const placement = placementByUse.get(id) ?? invalid('falta la colocación explícita de una instancia.'), rrId = placement.relationship;
    const rr = component(rrId, 'REPRESENTATION_RELATIONSHIP', 4, false), transform = component(rrId, 'REPRESENTATION_RELATIONSHIP_WITH_TRANSFORMATION', 1, false);
    component(rrId, 'SHAPE_REPRESENTATION_RELATIONSHIP', 0, false); text(rr.args[0]); optionalText(rr.args[1]);
    if (record(rrId).components.length !== 3 || reference(rr.args[2]) !== child.representation || reference(rr.args[3]) !== parent.representation || usedRelations.has(rrId)) invalid('relación de representación invertida, repetida o ambigua.');
    usedRelations.add(rrId);
    const transformId = reference(transform.args[0]), idt = component(transformId, 'ITEM_DEFINED_TRANSFORMATION', 4); text(idt.args[0]); optionalText(idt.args[1]);
    if (usedTransforms.has(transformId)) invalid('transformación compartida fuera del perfil admitido.');
    usedTransforms.add(transformId);
    const fromId = reference(idt.args[2]), toId = reference(idt.args[3]);
    if (!representations.get(child.representation)!.items.includes(fromId) || !representations.get(parent.representation)!.items.includes(toId)) invalid('los marcos de transformación no pertenecen a sus representaciones.');
    const pose = composeRigidPoses(frame(toId), inverseRigidPose(frame(fromId)));
    parent.occurrences.push({ id, name, definition: childId, pose }); incoming.add(childId);
  }
  if (usedPds.size !== ids('PRODUCT_DEFINITION_SHAPE').length || usedRelations.size !== ids('REPRESENTATION_RELATIONSHIP').length
    || usedRelations.size !== ids('REPRESENTATION_RELATIONSHIP_WITH_TRANSFORMATION').length || usedRelations.size !== ids('SHAPE_REPRESENTATION_RELATIONSHIP').length
    || usedTransforms.size !== ids('ITEM_DEFINED_TRANSFORMATION').length) invalid('relaciones estructurales sin una instancia única.');
  for (const def of definitions.values()) if (def.kind === 'assembly' && !def.occurrences.length) invalid('ensamblaje vacío no admitido.');
  const roots = [...definitions.keys()].filter(id => !incoming.has(id));
  if (roots.length !== 1) invalid('se requiere una única raíz estructural; hay raíces múltiples o un ciclo.');
  const visited = new Set<string>(); let expanded = 0, expandedSolids = 0;
  const visit = (id: string, path: Set<string>, depth: number): void => {
    if (path.has(id)) invalid('el grafo de ensamblaje contiene un ciclo.');
    if (depth > MAX_DEPTH) invalid('el ensamblaje supera la profundidad máxima de 32.');
    const definition = definitions.get(id)!;
    expandedSolids += definition.solids.length;
    if (expandedSolids > MAX_EXPANDED_SOLIDS) invalid('el ensamblaje supera 4096 sólidos expandidos.');
    visited.add(id); const next = new Set(path).add(id);
    for (const use of definition.occurrences) {
      if (++expanded > MAX_EXPANDED_OCCURRENCES) invalid('el ensamblaje supera 4096 instancias expandidas.');
      visit(use.definition, next, depth + 1);
    }
  };
  visit(roots[0], new Set(), 0);
  if (visited.size !== definitions.size) invalid('hay definiciones inaccesibles o un ciclo separado de la raíz.');
  return { root: roots[0], definitions: [...definitions.values()] };
}
