import { describe, expect, it } from 'vitest'
import { createDocument } from '../model/document'
import { createAssemblyDocument } from '../model/assemblyDocument'
import { setPartProperties } from '../model/partProperties'
import type { AssemblyScene, AssemblySceneBody } from '../cad/kernel.assembly-types'
import { assemblyMassKg, assemblyPartAppearanceKey, assemblyPartColors } from './assemblyPartAppearance'

// Original detached display DTOs exercise aggregation only, not native scene admission.
function fixture() {
  const part = setPartProperties(createDocument('Original density fixture'), { material: { name: 'Synthetic', densityKgPerM3: 1000 }, appearance: { color: '#cc6633' } })
  const document = createAssemblyDocument('Original density uses')
  const ref = { id: 'original-source', revision: 'r1' }
  document.definitions = [{ ...ref, kind: 'part', document: part },
    { ...ref, revision: 'r2', kind: 'part', document: setPartProperties(part, { material: { name: 'Synthetic revised', densityKgPerM3: 2000 }, appearance: { color: '#3366cc' } }) }]
  const body = (id: string, visible = true): AssemblySceneBody => ({ component: { occurrencePath: [id], definition: { ...ref } }, body: null, name: id, visible,
    worldPose: { translation: [0, 0, 0], rotation: [0, 0, 0, 1] }, vertices: [], normals: [], triangles: [], edgeLines: [], faces: [],
    volume: 1000, area: 600, solidCount: 1, bounds: { min: [0, 0, 0], max: [10, 10, 10] } })
  const scene: AssemblyScene = { kind: 'assembly-scene', sceneId: 'original-detached', bodies: [body('one'), body('two', false)],
    volume: 2000, area: 1200, solidCount: 2, prototypeCount: 1, bounds: null, visibleBounds: null, warnings: [] }
  return { document, scene, ref }
}
describe('saved source appearance and scene mass', () => {
  it('keeps same-id revisions distinct and resolves no unrelated revision', () => {
    const { document, ref } = fixture(), colors = assemblyPartColors(document)
    expect(colors.get(assemblyPartAppearanceKey(ref))).toBe('#cc6633')
    expect(colors.get(assemblyPartAppearanceKey({ ...ref, revision: 'r2' }))).toBe('#3366cc')
    expect(colors.has(assemblyPartAppearanceKey({ ...ref, revision: 'missing' }))).toBe(false)
  })
  it('converts mm³ to kg per active source use, retaining hidden and omitting absent uses', () => {
    const { document, scene } = fixture()
    expect(assemblyMassKg(document, scene, true)).toBeCloseTo(0.002, 12)
    scene.bodies[1].component.definition.revision = 'r2'
    expect(assemblyMassKg(document, scene, true)).toBeCloseTo(0.003, 12)
    scene.bodies.pop()
    expect(assemblyMassKg(document, scene, true)).toBeCloseTo(0.001, 12)
  })
  it('does not present a partial total for missing material, missing revisions or stale scenes', () => {
    const { document, scene } = fixture()
    expect(assemblyMassKg(document, scene, false)).toBeNull()
    expect(assemblyMassKg(document, null, true)).toBeNull()
    scene.bodies[1].component.definition.revision = 'missing'
    expect(assemblyMassKg(document, scene, true)).toBeNull()
    scene.bodies[1].component.definition.revision = 'r1'
    if (document.definitions[0].kind === 'part') delete document.definitions[0].document.material
    expect(assemblyMassKg(document, scene, true)).toBeNull()
  })
  it.each([NaN, Infinity, -1, Number.MIN_VALUE])('does not report a nonphysical or underflowed volume %s as mass', volume => {
    const { document, scene } = fixture()
    scene.bodies[0].volume = volume
    expect(assemblyMassKg(document, scene, true)).toBeNull()
  })
  it('keeps nonrepresentable positive mass unknown for an admitted tiny density', () => {
    const { document, scene } = fixture()
    if (document.definitions[0].kind === 'part') document.definitions[0].document.material!.densityKgPerM3 = Number.MIN_VALUE
    expect(assemblyMassKg(document, scene, true)).toBeNull()
  })
})
