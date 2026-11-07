import { expect, it } from 'vitest';
import { composeRigidPoses, transformRigidDirection, transformRigidPoint } from '../model/rigidPose';
import { readStepAssemblyStructure } from './kernel.step-structure';

// Original synthetic Part 21 structural graphs, authored from literal frames.
// Empty shell placeholders intentionally are NOT transferable BRep fixtures;
// these tests establish graph/placement syntax, not native geometry acceptance.
type V = [number, number, number];
type Definition = { id: string; representation: string; product: string; items: string[]; kind: 'part' | 'assembly'; representationType?: 'SHAPE_REPRESENTATION' | 'ADVANCED_BREP_SHAPE_REPRESENTATION' };
const quoted = (v: string) => `'${v.replaceAll("'", "''")}'`;
function recipe(unit = 'mm') {
  const rows = new Map<string, string>(); let next = 0;
  const add = (rhs: string) => { const id = String(++next); rows.set(id, rhs); return id; };
  const context = add("APPLICATION_CONTEXT('original structural parser test')"), productContext = add(`PRODUCT_CONTEXT('',#${context},'mechanical')`), definitionContext = add(`PRODUCT_DEFINITION_CONTEXT('part definition',#${context},'design')`);
  const length = add(unit === 'm' ? '(LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT($,.METRE.))' : '(LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.))');
  if (unit === 'inch') {
    const dimension = add('DIMENSIONAL_EXPONENTS(1,0,0,0,0,0,0)'), factor = add(`LENGTH_MEASURE_WITH_UNIT(25.4,#${length})`);
    rows.set(length, `(LENGTH_UNIT() NAMED_UNIT(#${dimension}) CONVERSION_BASED_UNIT('not used to infer scale',#${factor}))`);
    // The factor points to a separate explicit millimetre unit, not itself.
    const mm = add('(LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.))'); rows.set(factor, `LENGTH_MEASURE_WITH_UNIT(25.4,#${mm})`);
  }
  const representationContext = add(`(GEOMETRIC_REPRESENTATION_CONTEXT(3) GLOBAL_UNIT_ASSIGNED_CONTEXT((#${length})) REPRESENTATION_CONTEXT('',''))`);
  const frame = (p: V = [0, 0, 0], z: V = [0, 0, 1], x: V = [1, 0, 0]) => {
    const origin = add(`CARTESIAN_POINT('',(${p}))`), axis = add(`DIRECTION('',(${z}))`), direction = add(`DIRECTION('',(${x}))`);
    return add(`AXIS2_PLACEMENT_3D('',#${origin},#${axis},#${direction})`);
  };
  const origin = frame(), definitions: Definition[] = [];
  const define = (kind: 'part' | 'assembly', name: string): Definition => {
    const product = add(`PRODUCT('not-identity',${quoted(name)},'',(#${productContext}))`), formation = add(`PRODUCT_DEFINITION_FORMATION('','',#${product})`);
    const id = add(`PRODUCT_DEFINITION('design','',#${formation},#${definitionContext})`), pds = add(`PRODUCT_DEFINITION_SHAPE('','',#${id})`), items = [origin];
    if (kind === 'part') { const shell = add("CLOSED_SHELL('',())"); items.push(add(`MANIFOLD_SOLID_BREP('',#${shell})`)); }
    const representation = add('PLACEHOLDER()'); add(`SHAPE_DEFINITION_REPRESENTATION(#${pds},#${representation})`);
    const result = { id, representation, product, items, kind }; definitions.push(result); return result;
  };
  const connect = (parent: Definition, child: Definition, name: string, target = origin, source = origin) => {
    if (!parent.items.includes(target)) parent.items.push(target);
    if (!child.items.includes(source)) child.items.push(source);
    const use = add(`NEXT_ASSEMBLY_USAGE_OCCURRENCE('not-identity',${quoted(name)},'',#${parent.id},#${child.id},$)`);
    const pds = add(`PRODUCT_DEFINITION_SHAPE('Placement','',#${use})`), idt = add(`ITEM_DEFINED_TRANSFORMATION('','',#${source},#${target})`);
    const rr = add(`(REPRESENTATION_RELATIONSHIP('','',#${child.representation},#${parent.representation}) REPRESENTATION_RELATIONSHIP_WITH_TRANSFORMATION(#${idt}) SHAPE_REPRESENTATION_RELATIONSHIP())`);
    const cdsr = add(`CONTEXT_DEPENDENT_SHAPE_REPRESENTATION(#${rr},#${pds})`);
    return { use, pds, idt, rr, cdsr, target, source };
  };
  const finish = () => {
    for (const d of definitions) rows.set(d.representation, `${d.representationType ?? (d.kind === 'part' ? 'ADVANCED_BREP_SHAPE_REPRESENTATION' : 'SHAPE_REPRESENTATION')}('',(${d.items.map(id => `#${id}`).join(',')}),#${representationContext})`);
    return `ISO-10303-21;HEADER;FILE_DESCRIPTION(('original graph'),'2;1');FILE_SCHEMA(('AP242_MANAGED_MODEL_BASED_3D_ENGINEERING_MIM_LF {1 0 10303 442 1 1 4 }'));ENDSEC;DATA;${[...rows].map(([id, rhs]) => `#${id}=${rhs};`).join('\n')}ENDSEC;END-ISO-10303-21;`;
  };
  return { add, rows, frame, define, connect, finish, origin, representationContext, length };
}
const bytes = (text: string) => new TextEncoder().encode(text);
const read = (text: string) => readStepAssemblyStructure(bytes(text));
function pair() {
  const r = recipe(), parent = r.define('assembly', 'Root'), child = r.define('part', 'Leaf');
  const edge = r.connect(parent, child, 'instance'); return { ...r, parent, child, edge };
}
const near = (a: number[], b: number[]) => a.forEach((v, i) => expect(Math.abs(v - b[i])).toBeLessThanOrEqual(1e-10));
function addSolid(r: Pick<ReturnType<typeof recipe>, 'add'>, part: Definition): string {
  const shell = r.add("CLOSED_SHELL('',())"), solid = r.add(`MANIFOLD_SOLID_BREP('',#${shell})`); part.items.push(solid); return solid;
}

it('preserves nested reuse, separate same-name definitions and names independently of occurrence/product ID text', () => {
  const r = recipe(), root = r.define('assembly', 'Conjunto "Árbol"'), group = r.define('assembly', 'Grupo'), sub = r.define('assembly', 'Módulo ñ');
  const p = r.define('part', "Pieza 'gemela'"), q = r.define('part', "Pieza 'gemela'"), c = r.define('part', 'C');
  const left = r.connect(root, group, 'left', r.frame([100, 0, 0], [0, 0, 1], [0, 1, 0]));
  r.connect(root, group, 'right', r.frame([0, 100, 0], [0, -1, 0], [1, 0, 0]));
  const nested = r.connect(group, sub, 's', r.frame([0, 0, 20], [1, 0, 0], [0, 0, -1]));
  const a = r.connect(sub, p, 'a'); r.connect(sub, q, 'b', r.frame([10, 0, 0], [0, -1, 0])); r.connect(sub, c, 'c', r.frame([0, 10, 0], [0, 0, 1], [0, 1, 0]));
  const input = bytes(r.finish()), copy = input.slice(), result = readStepAssemblyStructure(input);
  expect(input).toEqual(copy); expect(result.root).toBe(root.id); expect(result.definitions).toHaveLength(6);
  const byId = new Map(result.definitions.map(d => [d.id, d]));
  expect(byId.get(root.id)?.name).toBe('Conjunto "Árbol"'); expect(byId.get(sub.id)?.name).toBe('Módulo ñ');
  expect(byId.get(p.id)?.name).toBe("Pieza 'gemela'"); expect(byId.get(q.id)?.name).toBe("Pieza 'gemela'");
  expect(byId.get(p.id)?.representation).not.toBe(byId.get(q.id)?.representation);
  expect(byId.get(root.id)?.occurrences.map(o => [o.name, o.definition])).toEqual([['left', group.id], ['right', group.id]]);
  const local = byId.get(root.id)!.occurrences.find(o => o.id === left.use)!.pose;
  const mid = byId.get(group.id)!.occurrences.find(o => o.id === nested.use)!.pose;
  const leaf = byId.get(sub.id)!.occurrences.find(o => o.id === a.use)!.pose;
  // Literal Ry90 then Rz90: [2,3,4] -> [4,3,18] -> [97,4,18].
  near(transformRigidPoint(composeRigidPoses(local, composeRigidPoses(mid, leaf)), [2, 3, 4]), [97, 4, 18]);
});

it('uses target times inverse(source), including a nonidentity rotated/translated source frame', () => {
  const r = pair(), from = r.frame([2, 0, 0], [0, 0, 1], [0, 1, 0]), to = r.frame([10, 20, 30], [0, -1, 0]);
  r.child.items.push(from); r.parent.items.push(to); r.rows.set(r.edge.idt, `ITEM_DEFINED_TRANSFORMATION('','',#${from},#${to})`);
  const result = read(r.finish()).definitions.find(d => d.id === r.parent.id)!.occurrences[0].pose;
  near(result.translation, [10, 20, 32]); near(transformRigidPoint(result, [1, 2, 3]), [12, 17, 31]);
});
it.each(['mm', 'm', 'inch'])('converts local translations from declared %s to mm without scaling rotations', unit => {
  const r = recipe(unit), parent = r.define('assembly', 'Root'), child = r.define('part', 'P'); r.connect(parent, child, 'a', r.frame([1, 2, 3], [0, -1, 0]));
  const pose = read(r.finish()).definitions.find(d => d.id === parent.id)!.occurrences[0].pose, scale = unit === 'mm' ? 1 : unit === 'm' ? 1000 : 25.4;
  near(pose.translation, [scale, 2 * scale, 3 * scale]); near(transformRigidPoint({ ...pose, translation: [0, 0, 0] }, [1, 2, 3]), [1, -3, 2]);
});
it('keeps a single part root and a detached fresh result, with positive scaled axis ratios', () => {
  const r = recipe(), p = r.define('part', 'P'); const first = read(r.finish());
  expect(first.root).toBe(p.id); expect(first.definitions[0].kind).toBe('part'); expect(first.definitions[0].occurrences).toEqual([]);
  first.definitions[0].name = 'mutated'; expect(read(r.finish()).definitions[0].name).toBe('P');
  const a = pair(), to = a.frame([0, 0, 0], [0, 0, 7], [2, 0, 1]); a.parent.items.push(to); a.rows.set(a.edge.idt, `ITEM_DEFINED_TRANSFORMATION('','',#${a.origin},#${to})`);
  near(transformRigidPoint(read(a.finish()).definitions[0].occurrences[0].pose, [1, 2, 3]), [1, 2, 3]);
});
it('preserves decoded literal names and never interprets text/comments as structural entities', () => {
  const r = pair(); r.rows.set(r.child.product, `PRODUCT('id','\\X2\\00F1\\X0\\ ''NEXT_ASSEMBLY_USAGE_OCCURRENCE''','',(#2))`);
  // #2 is the original PRODUCT_CONTEXT generated by this recipe.
  const result = read(r.finish().replace('DATA;', "DATA;/* #999=EXTERNAL_SOURCE('not an entity'); */"));
  expect(result.definitions.find(d => d.id === r.child.id)?.name).toBe("ñ 'NEXT_ASSEMBLY_USAGE_OCCURRENCE'");
});
it.each([Number.MIN_VALUE, 1.6e308])('normalizes original direction ratios without underflow/overflow changing the declared frame: %s', value => {
  const r = pair(), to = r.frame([0, 0, 0], [value, value, value], [1, 0, 0]);
  r.parent.items.push(to); r.rows.set(r.edge.idt, `ITEM_DEFINED_TRANSFORMATION('','',#${r.origin},#${to})`);
  const pose = read(r.finish()).definitions.find(d => d.id === r.parent.id)!.occurrences[0].pose;
  near(transformRigidDirection(pose, [0, 0, 1]), [1 / Math.sqrt(3), 1 / Math.sqrt(3), 1 / Math.sqrt(3)]);
  near(transformRigidDirection(pose, [1, 0, 0]), [Math.sqrt(2 / 3), -1 / Math.sqrt(6), -1 / Math.sqrt(6)]);
});

it.each(['schema', 'reversed', 'swapped-frames', 'missing-membership', 'missing-axis', 'zero-axis', 'parallel-axis', 'duplicate-link', 'missing-link', 'nonrigid-operator', 'part-child', 'alternative-representation', 'extra-product', 'extra-relation', 'direct-geometry'])('rejects the unsupported or ambiguous structural profile: %s', fault => {
  const r = pair(); let alter = (v: string) => v;
  if (fault === 'schema') alter = v => v.replace('AP242_MANAGED_MODEL_BASED_3D_ENGINEERING_MIM_LF', 'CONFIG_CONTROL_DESIGN');
  if (fault === 'reversed') r.rows.set(r.edge.rr, r.rows.get(r.edge.rr)!.replace(`#${r.child.representation},#${r.parent.representation}`, `#${r.parent.representation},#${r.child.representation}`));
  if (fault === 'swapped-frames' || fault === 'missing-membership') {
    const target = r.frame([9, 0, 0]); r.parent.items.push(target);
    r.rows.set(r.edge.idt, fault === 'swapped-frames' ? `ITEM_DEFINED_TRANSFORMATION('','',#${target},#${r.origin})` : `ITEM_DEFINED_TRANSFORMATION('','',#${r.origin},#${r.frame([8, 0, 0])})`);
  }
  if (fault === 'missing-axis') r.rows.set(r.origin, r.rows.get(r.origin)!.replace(/#[0-9]+\)$/, '$)'));
  if (fault === 'zero-axis' || fault === 'parallel-axis') {
    const f = r.frame([0, 0, 0], fault === 'zero-axis' ? [0, 0, 0] : [1, 0, 0], [1, 0, 0]); r.parent.items.push(f); r.rows.set(r.edge.idt, `ITEM_DEFINED_TRANSFORMATION('','',#${r.origin},#${f})`);
  }
  if (fault === 'duplicate-link') r.add(r.rows.get(r.edge.cdsr)!);
  if (fault === 'missing-link') r.rows.delete(r.edge.cdsr);
  if (fault === 'nonrigid-operator') r.rows.set(r.edge.idt, 'CARTESIAN_TRANSFORMATION_OPERATOR_3D($,$,$,$,2.)');
  if (fault === 'part-child') r.connect(r.child, r.parent, 'invalid');
  if (fault === 'alternative-representation') r.add([...r.rows.values()].find(v => v.startsWith('SHAPE_DEFINITION_REPRESENTATION(') && v.endsWith(`,#${r.child.representation})`))!);
  if (fault === 'extra-product') r.add("PRODUCT('dead','dead','',(#2))");
  if (fault === 'extra-relation') r.add(`REPRESENTATION_RELATIONSHIP('','',#${r.child.representation},#${r.parent.representation})`);
  if (fault === 'direct-geometry') r.parent.items.push(r.child.items[1]);
  expect(() => read(alter(r.finish()))).toThrow(/STEP/);
});
it.each(['MAPPED_ITEM', 'REPRESENTATION_MAP', 'MANIFOLD_SURFACE_SHAPE_REPRESENTATION', 'EXTERNAL_SOURCE', 'CONSTRUCTIVE_GEOMETRY_REPRESENTATION_RELATIONSHIP', 'MECHANICAL_DESIGN_AND_DRAUGHTING_RELATIONSHIP', 'PRODUCT_DEFINITION_RELATIONSHIP'])('rejects additional unsupported structural entities: %s', name => {
  const r = pair(); r.add(`${name}()`); expect(() => read(r.finish())).toThrow(/STEP/);
});
it.each(['SHAPE_REPRESENTATION', 'ADVANCED_BREP_SHAPE_REPRESENTATION'] as const)('retains both direct solids in one %s part without inventing a subassembly or product', type => {
  const r = pair(); r.child.representationType = type; const first = r.child.items[1], second = addSolid(r, r.child);
  const parsed = read(r.finish());
  expect(parsed.definitions).toHaveLength(2);
  expect(parsed.definitions.find(d => d.id === r.child.id)).toMatchObject({ kind: 'part', solids: [first, second], occurrences: [] });
  expect(parsed.definitions.find(d => d.id === r.parent.id)).toMatchObject({ kind: 'assembly', solids: [] });
  expect(parsed.definitions.find(d => d.id === r.parent.id)?.occurrences.map(o => o.definition)).toEqual([r.child.id]);
});
it('admits a single direct solid in SHAPE_REPRESENTATION and keeps part identity', () => {
  const r = pair(); r.child.representationType = 'SHAPE_REPRESENTATION';
  expect(read(r.finish()).definitions.find(d => d.id === r.child.id)).toMatchObject({ kind: 'part', solids: [r.child.items[1]], occurrences: [] });
});
it('retains six product identities and reused nested local poses when a same-name leaf has two material solids', () => {
  const r = recipe(), root = r.define('assembly', 'Root'), g = r.define('assembly', 'G'), s = r.define('assembly', 'S');
  const p = r.define('part', 'Same name'), q = r.define('part', 'Same name'), c = r.define('part', 'C');
  p.representationType = 'SHAPE_REPRESENTATION'; const second = addSolid(r, p);
  r.connect(root, g, 'left', r.frame([100, 0, 0], [0, 0, 1], [0, 1, 0])); r.connect(root, g, 'right', r.frame([0, 100, 0], [0, -1, 0]));
  r.connect(g, s, 's', r.frame([0, 0, 20], [1, 0, 0], [0, 0, -1]));
  r.connect(s, p, 'a'); r.connect(s, q, 'b', r.frame([10, 0, 0], [0, -1, 0])); r.connect(s, c, 'c', r.frame([0, 10, 0], [0, 0, 1], [0, 1, 0]));
  const parsed = read(r.finish()), byId = new Map(parsed.definitions.map(d => [d.id, d]));
  expect(parsed.definitions).toHaveLength(6); expect(byId.get(p.id)?.solids).toEqual([p.items[1], second]); expect(byId.get(p.id)?.kind).toBe('part');
  expect(byId.get(q.id)?.solids).toEqual([q.items[1]]); expect(byId.get(p.id)?.id).not.toBe(byId.get(q.id)?.id);
  expect(byId.get(root.id)?.occurrences.map(o => o.definition)).toEqual([g.id, g.id]);
  const left = byId.get(root.id)!.occurrences[0].pose, middle = byId.get(g.id)!.occurrences[0].pose, leaf = byId.get(s.id)!.occurrences[0].pose;
  // Added body's [11,2,5] corner: Ry90+[0,0,20] then Rz90+[100,0,0].
  near(transformRigidPoint(composeRigidPoses(left, composeRigidPoses(middle, leaf)), [11, 2, 5]), [98, 5, 9]);
});
it.each(['SHAPE_REPRESENTATION', 'ADVANCED_BREP_SHAPE_REPRESENTATION'] as const)('rejects a %s product that mixes material solids and child usages', type => {
  const r = pair(); r.child.representationType = type; addSolid(r, r.child);
  const other = r.define('part', 'Other'); r.connect(r.child, other, 'invented-child');
  expect(() => read(r.finish())).toThrow(/mezclar sólidos directos e instancias/);
});
it('requires nonempty child incidence for a placements-only SHAPE_REPRESENTATION', () => {
  const r = recipe(); r.define('assembly', 'Empty'); expect(() => read(r.finish())).toThrow(/ensamblaje vacío/);
});
it('rejects a placements-only advanced BRep representation', () => {
  const r = recipe(), d = r.define('assembly', 'Not a part'); d.representationType = 'ADVANCED_BREP_SHAPE_REPRESENTATION';
  expect(() => read(r.finish())).toThrow(/requiere entre 1 y 256/);
});
it.each(['SHAPE_REPRESENTATION', 'ADVANCED_BREP_SHAPE_REPRESENTATION'] as const)('accepts exactly 256 solids in a %s product and rejects the 257th atomically', type => {
  const r = pair(); r.child.representationType = type;
  for (let i = 1; i < 256; i++) addSolid(r, r.child);
  expect(read(r.finish()).definitions.find(d => d.id === r.child.id)?.solids).toEqual(r.child.items.slice(1));
  addSolid(r, r.child); expect(() => read(r.finish())).toThrow(/máximo 256/);
});
it('counts expanded material solids independently from occurrences, including repeated nested multibody products', () => {
  const r = recipe(), root = r.define('assembly', 'Root'), group = r.define('assembly', 'Shared'), part = r.define('part', 'P');
  part.representationType = 'SHAPE_REPRESENTATION'; for (let i = 1; i < 256; i++) addSolid(r, part);
  r.connect(root, group, 'left'); r.connect(root, group, 'right');
  for (let i = 0; i < 8; i++) r.connect(group, part, `p${i}`);
  // 18 expanded occurrences, 2*8*256=4096 expanded solids: no dedup by source.
  const accepted = read(r.finish()); expect(accepted.definitions).toHaveLength(3); expect(accepted.definitions.find(d => d.id === part.id)?.solids).toHaveLength(256);
  r.connect(group, part, 'one-more');
  expect(() => read(r.finish())).toThrow(/4096 sólidos expandidos/);
});
it.each(['multiple', 'reachable-cycle', 'isolated-cycle'])('rejects multiple roots and inaccessible/cyclic definitions: %s', kind => {
  const r = pair(), a = r.define('assembly', 'a'), b = r.define('assembly', 'b');
  if (kind !== 'multiple') { r.connect(a, b, 'b'); r.connect(b, a, 'a'); }
  else { r.connect(a, r.child, 'p'); r.connect(b, r.child, 'p'); }
  if (kind === 'reachable-cycle') r.connect(r.parent, a, 'enter');
  expect(() => read(r.finish())).toThrow(/raíz|raíces|ciclo|vacío/);
});
it('bounds definitions before reconstructing a large graph', () => {
  const r = recipe(); for (let i = 0; i < 513; i++) r.define('part', `P${i}`);
  expect(() => read(r.finish())).toThrow(/512/);
});
it('bounds expanded occurrences even for a small acyclic reused graph', () => {
  const r = recipe(), root = r.define('assembly', 'root'); let parent = root;
  for (let i = 0; i < 11; i++) { const child = r.define(i === 10 ? 'part' : 'assembly', `${i}`); r.connect(parent, child, 'a'); r.connect(parent, child, 'b'); parent = child; }
  // Binary reuse yields 4094 expanded edges; two direct uses reach exactly 4096.
  r.connect(root, parent, 'extra-a'); r.connect(root, parent, 'extra-b');
  expect(read(r.finish()).definitions).toHaveLength(12);
  r.connect(root, parent, 'one-too-many');
  expect(() => read(r.finish())).toThrow(/4096/);
});
it('bounds nesting depth separately from expansion', () => {
  const r = recipe(); let parent = r.define('assembly', 'root');
  for (let i = 0; i < 33; i++) { const child = r.define(i === 32 ? 'part' : 'assembly', `${i}`); r.connect(parent, child, 'child'); parent = child; }
  expect(() => read(r.finish())).toThrow(/profundidad.*32/);
});
