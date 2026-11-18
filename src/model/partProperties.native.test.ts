import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { afterEach, beforeAll, expect, it } from 'vitest'
import initOpenCascade from 'replicad-opencascadejs'
import { measureShapeSurfaceProperties, measureShapeVolumeProperties, setOC } from 'replicad'
import { CadEngine } from '../cad/kernel.engine'
import { validateAssemblyShape } from '../cad/kernel.assembly-placements'
import { withNativeOwners } from '../cad/kernel.native-ownership'
import { parseDocument, serializeDocument, validateDocument } from './document'
import { partMassKg, setPartProperties } from './partProperties'

const engine = new CadEngine(), require = createRequire(import.meta.url)
beforeAll(async () => {
  const wasmBinary = await readFile(require.resolve('replicad-opencascadejs/wasm'))
  setOC(await initOpenCascade({ wasmBinary, print: () => undefined }))
}, 60_000)
afterEach(() => engine.dispose())

it('retains native cube topology, volume, area, bounds and references after properties and fresh reopening', () => {
  // Independently authored original 10 × 10 × 10 mm cube: volume 1000 mm³,
  // area 600 mm², one closed solid. Density 1000 is synthetic, not a preset.
  const original = validateDocument({ version: 1, id: 'native-properties-cube', name: 'Original cube', units: 'mm',
    createdAt: '2026-11-07T00:00:00.000Z', updatedAt: '2026-11-07T00:00:00.000Z', features: [
      { id: 'profile', name: 'Original square', type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
        profile: { kind: 'rectangle', center: [0, 0], width: 10, height: 10 } },
      { id: 'solid', name: 'Original cube', type: 'extrude', sketchId: 'profile', depth: 10,
        symmetric: false, suppressed: false, bodyOperation: { mode: 'new', bodyId: 'cube' } },
    ] })
  const first = engine.build(original.features)
  expect(first.featureErrors).toEqual([])
  const changed = setPartProperties(original, { material: { name: 'Synthetic density', densityKgPerM3: 1000 }, appearance: { color: '#F07010' } })
  expect(partMassKg(changed, { model: first, builtFeatures: original.features, busy: false, sourceLoading: false, editing: false, staged: false })).toBeNull()
  const reopened = parseDocument(serializeDocument(changed))
  // Dispose the first owner's native cache before rebuilding the saved recipe.
  engine.dispose()
  const fresh = engine.build(reopened.features)
  expect(fresh.featureErrors).toEqual([]); expect(fresh.warnings).toEqual([])
  expect(fresh.volume).toBeCloseTo(1000, 8)
  expect(fresh.bounds.min).toEqual([-5, -5, 0]); expect(fresh.bounds.max).toEqual([5, 5, 10])
  expect(fresh.edges.map(value => value.ref)).toEqual(first.edges.map(value => value.ref))
  expect(fresh.faces?.map(value => value.ref)).toEqual(first.faces?.map(value => value.ref))
  expect(fresh.bodies?.map(value => value.ref)).toEqual(first.bodies?.map(value => value.ref))
  withNativeOwners(owners => {
    const shape = owners.own(engine.copyCurrentBodyShape({ bodyId: 'cube', sourceFeatureId: 'solid' }))
    expect(validateAssemblyShape(shape)).toBe(1)
    expect(owners.own(measureShapeVolumeProperties(shape)).volume).toBeCloseTo(1000, 8)
    expect(owners.own(measureShapeSurfaceProperties(shape)).area).toBeCloseTo(600, 8)
  })
  expect(partMassKg(reopened, { model: fresh, builtFeatures: reopened.features, busy: false, sourceLoading: false, editing: false, staged: false })).toBeCloseTo(0.001, 15)
  expect(reopened.features).toEqual(original.features)
})
