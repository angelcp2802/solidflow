import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import { getOC, setOC, type Shape3D } from 'replicad'
import { beforeAll, expect, it, vi } from 'vitest'
import { assemblyDefinitionKey, createAssemblyDocument, expandAssemblyParts, parseAssemblyDocument, serializeAssemblyDocument, type AssemblyDocument, type EmbeddedAssemblyDefinition, type EmbeddedPartDefinition } from '../model/assemblyDocument'
import { insertAssemblyDocument } from '../model/assemblyImport'
import { createStepSource, decodeStepSource, type StepSource } from '../model/stepSource'
import { transformRigidDirection } from '../model/rigidPose'
import { CadEngine } from './kernel.engine'
import { exportAssemblyStepStructureNative } from './kernel.assembly-step-export'
import { importAssemblyStepStructureNative } from './kernel.assembly-step-import'
import { assemblyStepStructureFixture } from './kernel.assembly-step-structure-fixture.test-utils'
import { placeAssemblyShape, validateAssemblyShape } from './kernel.assembly-placements'
import { NativeOwners, withNativeOwners } from './kernel.native-ownership'
import { stepLengthUnit } from './kernel.step-units'

let source: StepSource
beforeAll(async () => {
  setOC(await initOpenCascade({ wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')), print: () => undefined, printErr: () => undefined }))
  source = createStepSource(new Uint8Array(await exportAssemblyStepStructureNative(assemblyStepStructureFixture()).arrayBuffer()))
}, 60_000)
const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(Math.max(1e-6, Math.abs(b) * 1e-10))
const vector = (a: number[], b: number[]) => { expect(a).toHaveLength(b.length); a.forEach((x, i) => near(x, b[i])) }
const files = () => [...getOC().FS.readdir('/')].sort()
const expectedBounds = [
  [[97, 0, 18], [100, 4, 20]], [[100, 0, 8], [104, 3, 10]], [[89, 0, 20], [90, 5, 22]],
  [[0, 80, 0], [4, 82, 3]], [[0, 90, -4], [3, 92, 0]], [[0, 78, 10], [5, 80, 11]],
]
function child(document: AssemblyDocument, node: AssemblyDocument | EmbeddedAssemblyDefinition, name: string) {
  const uses = node.occurrences.filter(o => o.name === name)
  expect(uses).toHaveLength(1)
  const definition = document.definitions.find(d => assemblyDefinitionKey(d) === assemblyDefinitionKey(uses[0].definition))!
  expect(definition).toBeDefined()
  return { occurrence: uses[0], definition }
}
function graph(document: AssemblyDocument, right = true, scale = 1) {
  expect(document.name).toBe('Conjunto "Árbol" Ω')
  expect(document.units).toBe('mm')
  expect(document.mates).toEqual([])
  expect(document.occurrences.map(o => o.name)).toEqual(right ? ['left', 'right'] : ['left'])
  const left = child(document, document, 'left'), g = left.definition as EmbeddedAssemblyDefinition
  expect(g.kind).toBe('assembly'); expect(g.name).toBe('Grupo "G" Ω')
  if (right) expect(child(document, document, 'right').definition).toBe(g)
  expect(g.occurrences.map(o => o.name)).toEqual(['s'])
  const s = child(document, g, 's').definition as EmbeddedAssemblyDefinition
  expect(s.kind).toBe('assembly'); expect(s.name).toBe('Módulo "S" ñ')
  expect(s.occurrences.map(o => o.name)).toEqual(['a', 'b', 'c'])
  const p = child(document, s, 'a').definition as EmbeddedPartDefinition, q = child(document, s, 'b').definition as EmbeddedPartDefinition
  expect(p.kind).toBe('part'); expect(q.kind).toBe('part')
  expect(p.document.name).toBe('Pieza "gemela" ñ'); expect(q.document.name).toBe(p.document.name)
  expect(assemblyDefinitionKey(p)).not.toBe(assemblyDefinitionKey(q))
  expect(document.definitions.filter(d => d.kind === 'part')).toHaveLength(3)
  expect(document.definitions.filter(d => d.kind === 'assembly')).toHaveLength(2)
  // Literal local basis images distinguish transpose and rotation-order errors.
  const basis = [[1, 0, 0], [0, 1, 0], [0, 0, 1]] as [number, number, number][]
  const rotated = (rotation: typeof left.occurrence.pose.rotation, expected: number[][]) => basis.forEach((b, i) => vector(transformRigidDirection({ rotation, translation: [0, 0, 0] }, b), expected[i]))
  rotated(left.occurrence.pose.rotation, [[0, 1, 0], [-1, 0, 0], [0, 0, 1]])
  vector(left.occurrence.pose.translation, [100 * scale, 0, 0])
  if (right) { const r = child(document, document, 'right').occurrence; rotated(r.pose.rotation, [[1, 0, 0], [0, 0, 1], [0, -1, 0]]); vector(r.pose.translation, [0, 100 * scale, 0]) }
  const inner = child(document, g, 's').occurrence
  rotated(inner.pose.rotation, [[0, 0, -1], [0, 1, 0], [1, 0, 0]]); vector(inner.pose.translation, [0, 0, 20 * scale])
  rotated(child(document, s, 'b').occurrence.pose.rotation, [[1, 0, 0], [0, 0, 1], [0, -1, 0]])
  rotated(child(document, s, 'c').occurrence.pose.rotation, [[0, 1, 0], [-1, 0, 0], [0, 0, 1]])
}
function metrics(shape: Shape3D, volume: number, area: number, bounds: number[][]) {
  withNativeOwners(owners => {
    expect(validateAssemblyShape(shape)).toBe(1)
    const oc = getOC(), v = owners.own(new oc.GProp_GProps()), a = owners.own(new oc.GProp_GProps())
    oc.BRepGProp.VolumeProperties(shape.wrapped, v, false, false, false)
    oc.BRepGProp.SurfaceProperties(shape.wrapped, a, false, false)
    near(v.Mass(), volume); near(a.Mass(), area)
    const box = owners.own(shape.boundingBox).bounds
    vector(box[0], bounds[0]); vector(box[1], bounds[1])
  })
}
function geometry(document: AssemblyDocument, count = 6, scale = 1) {
  const saved = serializeAssemblyDocument(document), leaves = expandAssemblyParts(document)
  expect(leaves).toHaveLength(count)
  withNativeOwners(owners => {
    const engines = new Map<string, CadEngine>()
    for (const leaf of leaves) {
      const key = assemblyDefinitionKey(leaf.definition)
      let engine = engines.get(key)
      const isC = leaf.definition.document.name === 'Pieza distinta Ω', size = isC ? [1, 2, 5] : [2, 3, 4]
      if (!engine) {
        engine = new CadEngine(); owners.own({ delete: () => engine!.dispose() }); engines.set(key, engine)
        const feature = leaf.definition.document.features[0]
        expect(leaf.definition.document.features).toHaveLength(1); expect(feature.type).toBe('importedSolid')
        if (feature.type !== 'importedSolid') throw Error('Expected autonomous imported base')
        expect(stepLengthUnit(decodeStepSource(feature.source))).toEqual({ millimetersPerUnit: 1 })
        expect(feature.source.sha256).toMatch(/^[a-f0-9]{64}$/)
        const inventory = engine.rebuildForAssemblyReferences(leaf.definition.document.features)
        expect(inventory.featureErrors).toEqual([])
        metrics(owners.own(engine.copyCurrentBodyShape(null)), (isC ? 10 : 24) * scale ** 3, (isC ? 34 : 52) * scale ** 2, [[0, 0, 0], size.map(x => x * scale)])
      }
      const pathNames = leaf.chain.map(o => o.name), index = (pathNames[0] === 'right' ? 3 : 0) + ['a', 'b', 'c'].indexOf(pathNames.at(-1)!)
      expect(index).toBeGreaterThanOrEqual(0)
      const local = owners.own(engine.copyCurrentBodyShape(null)), placed = owners.own(placeAssemblyShape(local, leaf.worldPose))
      metrics(placed, (isC ? 10 : 24) * scale ** 3, (isC ? 34 : 52) * scale ** 2, expectedBounds[index].map(side => side.map(x => x * scale)))
    }
    expect(engines.size).toBe(3)
  })
  expect(serializeAssemblyDocument(document)).toBe(saved)
}

it('rejects an occupied temporary import path without overwriting or removing foreign bytes', () => {
  const oc = getOC(), path = '/solidflow-structure-import-1.step', sentinel = new TextEncoder().encode('Original foreign sentinel')
  oc.FS.writeFile(path, sentinel)
  const baseline = files()
  try {
    expect(() => importAssemblyStepStructureNative(source)).toThrow()
    expect(new Uint8Array(oc.FS.readFile(path))).toEqual(sentinel)
    expect(files()).toEqual(baseline)
  } finally { oc.FS.unlink(path) }
})

it('preserves a foreign autonomous-part path when the first local serialization collides', () => {
  // The previous rejected import consumed 1; this import allocates 2, and its
  // first local part serialization allocates 3. No private counter is reset.
  const oc = getOC(), path = '/solidflow-structure-part-3.step', sentinel = new TextEncoder().encode('Original foreign part sentinel')
  oc.FS.writeFile(path, sentinel)
  const baseline = files()
  try {
    expect(() => importAssemblyStepStructureNative(source)).toThrow()
    expect(new Uint8Array(oc.FS.readFile(path))).toEqual(sentinel)
    expect(files()).toEqual(baseline)
  } finally { oc.FS.unlink(path) }
})

it('imports actual product identity/reuse and autonomous v2 bases, then reexports and rebuilds the saved round trip', async () => {
  const baseline = files(), original = source.data
  const first = parseAssemblyDocument(serializeAssemblyDocument(importAssemblyStepStructureNative(source)))
  graph(first); geometry(first)
  const exported = createStepSource(new Uint8Array(await exportAssemblyStepStructureNative(first).arrayBuffer()))
  const second = parseAssemblyDocument(serializeAssemblyDocument(importAssemblyStepStructureNative(exported)))
  graph(second); geometry(second)
  expect(source.data).toBe(original); expect(files()).toEqual(baseline)
}, 60_000)

it.each([false, true])('preserves active hidden geometry and omits suppressed descendants: suppressedRight=%s', async suppressedRight => {
  const baseline = files(), input = assemblyStepStructureFixture({ hiddenRight: true, suppressedRight })
  const document = importAssemblyStepStructureNative(createStepSource(new Uint8Array(await exportAssemblyStepStructureNative(input).arrayBuffer())))
  graph(document, !suppressedRight); geometry(document, suppressedRight ? 3 : 6)
  expect(files()).toEqual(baseline)
}, 60_000)

it('withholds the whole document on native entity-transfer failure and restores virtual files', () => {
  const baseline = files(), original = NativeOwners.prototype.own
  let injected = false
  const spy = vi.spyOn(NativeOwners.prototype, 'own').mockImplementation(function<T extends { delete(): void }>(this: NativeOwners, value: T): T {
    if (value instanceof getOC().STEPControl_Reader) {
      Object.defineProperty(value, 'TransferEntity', { configurable: true, value: () => { injected = true; return false } })
    }
    return original.call(this, value) as T
  })
  try { expect(() => importAssemblyStepStructureNative(source)).toThrow(/transferencia/); expect(injected).toBe(true) }
  finally { spy.mockRestore() }
  expect(files()).toEqual(baseline)
})

it('keeps a multibody product as one part with two explicit autonomous saved body assignments', async () => {
  const baseline = files(), document = assemblyStepStructureFixture(), p = document.definitions.find(d => d.kind === 'part') as EmbeddedPartDefinition
  p.document.features.push(
    { id: 'other-profile', name: 'Independent second rectangle', type: 'sketch', plane: 'XY', offset: 0, suppressed: false, profile: { kind: 'rectangle', center: [10.5, 1], width: 1, height: 2 } },
    { id: 'other-solid', name: 'Independent second prism', type: 'extrude', sketchId: 'other-profile', depth: 5, symmetric: false, suppressed: false, bodyOperation: { mode: 'new', bodyId: 'other' } },
  )
  const bytes = new Uint8Array(await exportAssemblyStepStructureNative(document).arrayBuffer())
  const imported = importAssemblyStepStructureNative(createStepSource(bytes))
  graph(imported)
  const leaves = expandAssemblyParts(imported)
  const first = leaves.find(leaf => leaf.chain.at(-1)?.name === 'a')!.definition.document.features[0]
  expect(first.type).toBe('importedBodies')
  if (first.type !== 'importedBodies') throw Error('Expected one multibody part base')
  expect(first.bodies).toHaveLength(2)
  expect(new Set(first.bodies.map(body => body.bodyId)).size).toBe(2)
  expect(imported.definitions.filter(definition => definition.kind === 'part')).toHaveLength(3)
  expect(leaves).toHaveLength(6)
  expect(files()).toEqual(baseline)
}, 60_000)

// Actual generated original STEP coordinates are unchanged; only declared units
// change. Native import must scale both prototype geometry and local placements.
// Comparisons use 1e-10 relative plus a 1e-6 absolute coordinate/mass floor.
function declaredUnits(unit: 'meter' | 'inch'): StepSource {
  let text = new TextDecoder('utf-8', { fatal: true }).decode(decodeStepSource(source))
  if (unit === 'meter') {
    let count = 0
    text = text.replace(/SI_UNIT\(\s*\.MILLI\.\s*,\s*\.METRE\.\s*\)/g, () => { count++; return 'SI_UNIT($,.METRE.)' })
    expect(count).toBeGreaterThan(0)
  } else {
    const ids = [...text.matchAll(/#(\d+)\s*=/g)].map(m => Number(m[1]))
    let next = Math.max(...ids) + 1
    const dimension = next++, measure = next++, millimeter = next++
    let count = 0
    text = text.replace(/#(\d+)\s*=\s*\(\s*LENGTH_UNIT\(\s*\)\s*NAMED_UNIT\(\s*\*\s*\)\s*SI_UNIT\(\s*\.MILLI\.\s*,\s*\.METRE\.\s*\)\s*\)\s*;/g,
      (_record, id: string) => { count++; return '#' + id + "=(CONVERSION_BASED_UNIT('INCH',#" + measure + ') LENGTH_UNIT() NAMED_UNIT(#' + dimension + '));' })
    expect(count).toBeGreaterThan(0)
    const extra = '#' + dimension + '=DIMENSIONAL_EXPONENTS(1.,0.,0.,0.,0.,0.,0.);\n'
      + '#' + measure + '=LENGTH_MEASURE_WITH_UNIT(LENGTH_MEASURE(25.4),#' + millimeter + ');\n'
      + '#' + millimeter + '=(LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.));\n'
    expect(text).toMatch(/ENDSEC;\s*END-ISO-10303-21;/)
    text = text.replace(/ENDSEC;\s*END-ISO-10303-21;/, extra + 'ENDSEC;END-ISO-10303-21;')
  }
  return createStepSource(new TextEncoder().encode(text))
}
for (const [unit, scale] of [['meter', 1000], ['inch', 25.4]] as const) {
  it('imports actual native ' + unit + ' declarations and saves autonomous millimetre bases', () => {
    const baseline = files(), imported = importAssemblyStepStructureNative(declaredUnits(unit))
    const saved = parseAssemblyDocument(serializeAssemblyDocument(imported))
    graph(saved, true, scale); geometry(saved, 6, scale)
    expect(files()).toEqual(baseline)
  }, 60_000)
}

it('assigns distinct coherent revisions to repeated source imports so both complete graphs can be inserted', () => {
  const baseline = files(), originalBytes = source.data
  let first: AssemblyDocument, second: AssemblyDocument
  // Only Date is controlled: native commands and timeout machinery stay real.
  vi.useFakeTimers({ toFake: ['Date'] })
  try {
    vi.setSystemTime(new Date('2026-10-23T12:00:00.000Z'))
    first = importAssemblyStepStructureNative(source)
    vi.setSystemTime(new Date('2026-10-23T12:00:01.000Z'))
    second = importAssemblyStepStructureNative(source)
  } finally { vi.useRealTimers() }
  expect(first!.id).toBe(second!.id)
  expect(first!.revision).not.toBe(second!.revision)
  expect(first!.createdAt).not.toBe(second!.createdAt)
  graph(first!); graph(second!)
  for (const document of [first!, second!]) {
    expect(document.definitions.every(d => d.revision === document.revision)).toBe(true)
    for (const node of [document, ...document.definitions.filter((d): d is EmbeddedAssemblyDefinition => d.kind === 'assembly')]) {
      expect(node.occurrences.every(o => o.definition.revision === document.revision)).toBe(true)
    }
  }
  const once = insertAssemblyDocument(createAssemblyDocument('Original repeated neutral imports'), first!)
  const twice = insertAssemblyDocument(once, second!)
  expect(twice.occurrences).toHaveLength(2)
  expect(expandAssemblyParts(parseAssemblyDocument(serializeAssemblyDocument(twice)))).toHaveLength(12)
  expect(source.data).toBe(originalBytes)
  expect(files()).toEqual(baseline)
}, 60_000)
