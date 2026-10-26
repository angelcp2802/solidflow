import { describe, expect, it } from 'vitest'
import type { CadResult, Feature, PickableBody, PickableFace, PlaneFrame, SketchFeature } from '../cad/kernel.types'
import { partNormalToTarget, partViewReferenceKey, togglePartViewReference, type PartViewReference } from './partNormalTo'

// Original DTO selection fixtures only: no native surface or renderer claim.
const oblique: PlaneFrame = { origin: [17, -5, 9], normal: [3 / 5, 0, 4 / 5], xDirection: [4 / 5, 0, -3 / 5] }
const face = (id: string, frame: PlaneFrame | null = structuredClone(oblique), source = 'source'): PickableFace => ({
  ref: { sourceFeatureId: source, key: 'face-v2|' + id }, frame, vertices: [], triangles: [],
})
const reference = (selected: PickableFace): PartViewReference => ({ kind: 'face', face: { ...selected.ref } })
const sketch = (id = 'profile'): SketchFeature => ({ id, name: id, type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
  profile: { kind: 'rectangle', center: [0, 0], width: 3, height: 2 } })
const extrusion: Feature = { id: 'boss', name: 'Original boss', type: 'extrude', sketchId: 'profile', depth: 4, symmetric: false, suppressed: false }
const datum: Feature = { id: 'datum', name: 'Original datum', type: 'plane', support: { kind: 'principal', plane: 'XZ' }, offset: 5, reversed: false, suppressed: false }
const model = (changes: Partial<CadResult> = {}): CadResult => ({ vertices: [], normals: [], triangles: [], edgeLines: [], edges: [],
  volume: 24, bounds: { min: [0, 0, 0], max: [3, 2, 4] }, warnings: [], featureErrors: [], ...changes })
const body = (id: string, source: string, faces: PickableFace[]): PickableBody => ({ ref: { bodyId: id, sourceFeatureId: source },
  createdByFeatureId: source, name: id, vertices: [], normals: [], triangles: [], edgeLines: [], edges: [], faces,
  volume: 24, bounds: { min: [0, 0, 0], max: [3, 2, 4] } })
const featureReference = (id: string): PartViewReference => ({ kind: 'feature', id })

describe('current part Normal To selection resolution', () => {
  it('distinguishes no selection from missing geometry and preserves principal-plane conventions', () => {
    expect(partNormalToTarget([], null, [])).toEqual({ kind: 'none' })
    expect(partNormalToTarget([reference(face('missing'))], null, [])).toBeNull()
    expect(partNormalToTarget([{ kind: 'principal', plane: 'XZ' }], null, [])).toEqual({ kind: 'plane',
      key: '["principal","XZ"]', frame: { origin: [0, -0, 0], normal: [0, -1, 0], xDirection: [1, 0, 0] } })
  })

  it('resolves only one current primary face and clones the actual oblique frame', () => {
    const current = face('current'), before = structuredClone(current), scene = model({ faces: [current] })
    const target = partNormalToTarget([reference(current)], scene, [])
    expect(target).toEqual({ kind: 'plane', key: partViewReferenceKey(reference(current)), frame: oblique })
    if (target?.kind !== 'plane') throw Error('Expected selected planar target')
    Reflect.set(target.frame.normal, 0, 99); Reflect.set(target.frame.origin, 1, 99)
    expect(current).toEqual(before)
    expect(partNormalToTarget([reference(face('obsolete'))], scene, [])).toBeNull()
    expect(partNormalToTarget([reference(face('current', oblique, 'other-producer'))], scene, [])).toBeNull()
    expect(partNormalToTarget([reference(current)], model({ faces: [current, structuredClone(current)] }), [])).toBeNull()
    current.aliases = [{ sourceFeatureId: 'source', key: 'face-v1|old' }]
    expect(partNormalToTarget([{ kind: 'face', face: current.aliases[0] }], scene, [])).toBeNull()
  })

  it('uses explicit body namespaces and never falls back to aggregate faces', () => {
    const aggregate = face('aggregate'), first = face('same-key', oblique, 'first-producer'), second = face('same-key', oblique, 'second-producer')
    const scene = model({ bodyCatalogActive: true, faces: [aggregate], bodies: [body('A', 'first-producer', [first]), body('B', 'second-producer', [second])] })
    expect(partNormalToTarget([reference(first)], scene, [])?.kind).toBe('plane')
    expect(partNormalToTarget([reference(second)], scene, [])?.kind).toBe('plane')
    expect(partNormalToTarget([reference(aggregate)], scene, [])).toBeNull()
    expect(partNormalToTarget([reference(first)], { ...scene, bodies: [] }, [])).toBeNull()
    const duplicateOwners = { ...scene, bodies: [body('A', 'first-producer', [first]), body('A', 'second-producer', [second])] }
    expect(partNormalToTarget([reference(first)], duplicateOwners, [])).toBeNull()
    const ambiguousFaces = { ...scene, bodies: [body('A', 'first-producer', [first]), body('B', 'second-producer', [structuredClone(first)])] }
    expect(partNormalToTarget([reference(first)], ambiguousFaces, [])).toBeNull()
  })

  it('accepts current analytic curved-face axes but does not derive one from display triangles', () => {
    const current = face('cylinder', null)
    current.viewAxis = { kind: 'axis', point: [8, 9, 10], direction: [0, 1, 0], xDirection: [1, 0, 0] }
    const target = partNormalToTarget([reference(current)], model({ faces: [current] }), [])
    expect(target).toEqual({ key: partViewReferenceKey(reference(current)), ...current.viewAxis })
    if (target?.kind !== 'axis') throw Error('Expected an analytic axis target')
    Reflect.set(target.direction, 1, 99); expect(current.viewAxis.direction).toEqual([0, 1, 0])
    delete current.viewAxis; current.vertices = [0, 0, 0, 1, 0, 0, 0, 1, 0]; current.triangles = [0, 1, 2]
    expect(partNormalToTarget([reference(current)], model({ faces: [current] }), [])).toBeNull()
  })

  it('resolves a selected reference plane only from one successful current visual', () => {
    const selected = [featureReference('datum')], scene = model({ planes: [{ id: 'datum', frame: structuredClone(oblique) }] })
    expect(partNormalToTarget(selected, scene, [datum])).toEqual({ kind: 'plane', key: '["feature","datum"]', frame: oblique })
    expect(partNormalToTarget(selected, scene, [{ ...datum, suppressed: true }])).toBeNull()
    expect(partNormalToTarget(selected, scene, [datum, structuredClone(datum)])).toBeNull()
    expect(partNormalToTarget(selected, model({ planes: scene.planes, featureErrors: [{ id: 'datum', message: 'Original rejection' }] }), [datum])).toBeNull()
    expect(partNormalToTarget(selected, model({ planes: [...scene.planes!, ...scene.planes!] }), [datum])).toBeNull()
    expect(partNormalToTarget(selected, model(), [datum])).toBeNull()
  })

  it('uses the resolved sketch frame for a sketch or a feature with exactly one sketch', () => {
    const source = sketch(), scene = model({ sketches: [{ id: source.id, frame: structuredClone(oblique), lines: [], constructionLines: [] }] })
    for (const id of ['profile', 'boss']) {
      const target = partNormalToTarget([featureReference(id)], scene, [source, extrusion])
      expect(target).toEqual({ kind: 'plane', key: JSON.stringify(['feature', id]), frame: oblique })
      if (target?.kind !== 'plane') throw Error('Expected resolved sketch frame')
      Reflect.set(target.frame.origin, 0, 999)
      expect(scene.sketches![0].frame).toEqual(oblique)
    }
    expect(partNormalToTarget([featureReference('boss')], scene, [extrusion])).toBeNull()
    expect(partNormalToTarget([featureReference('boss')], scene, [{ ...source, suppressed: true }, extrusion])).toBeNull()
    expect(partNormalToTarget([featureReference('boss')], model(), [source, extrusion])).toBeNull()
    expect(partNormalToTarget([featureReference('boss')], model({ sketches: [...scene.sketches!, ...scene.sketches!] }), [source, extrusion])).toBeNull()
  })

  it('rejects an ambiguous or failed sketch source even if an obsolete visual remains', () => {
    const source = sketch(), scene = model({ sketches: [{ id: source.id, frame: structuredClone(oblique), lines: [], constructionLines: [] }] })
    expect(partNormalToTarget([featureReference('boss')], scene, [source, structuredClone(source), extrusion])).toBeNull()
    expect(partNormalToTarget([featureReference('boss')], { ...scene, featureErrors: [{ id: source.id, message: 'Original failed source' }] }, [source, extrusion])).toBeNull()
  })

  it('rejects multi-sketch features instead of selecting the first input implicitly', () => {
    const profile = sketch(), path = sketch('path')
    const sweep: Feature = { id: 'sweep', name: 'Original sweep', type: 'sweep', profileSketchId: profile.id, pathSketchId: path.id,
      path: [], orientation: 'followPath', merge: false, suppressed: false }
    const scene = model({ sketches: [profile, path].map(value => ({ id: value.id, frame: structuredClone(oblique), lines: [], constructionLines: [] })) })
    expect(partNormalToTarget([featureReference(sweep.id)], scene, [profile, path, sweep])).toBeNull()
    expect(partNormalToTarget([featureReference('not-current')], scene, [profile, path, sweep])).toBeNull()
  })

  it('retains two ordered planar references with detached frames and rejects mixed/dual curved selections', () => {
    const planar = face('planar'), curved = face('curved', null)
    curved.viewAxis = { kind: 'axis', point: [0, 0, 0], direction: [0, 0, 1], xDirection: [1, 0, 0] }
    const otherCurved = { ...structuredClone(curved), ref: { ...curved.ref, key: 'face-v2|second-curved' } }
    const principal: PartViewReference = { kind: 'principal', plane: 'XY' }, refs = [reference(planar), principal]
    const scene = model({ faces: [planar, curved, otherCurved] }), original = structuredClone({ refs, scene })
    const forward = partNormalToTarget(refs, scene, []), reverse = partNormalToTarget([...refs].reverse(), scene, [])
    expect(forward?.kind).toBe('planes'); expect(reverse?.kind).toBe('planes')
    if (forward?.kind !== 'planes' || reverse?.kind !== 'planes') throw Error('Expected ordered planes')
    expect(forward.first).toEqual(oblique); expect(reverse.second).toEqual(oblique)
    expect(forward.key).not.toEqual(reverse.key)
    Reflect.set(forward.first.origin, 0, 999); expect({ refs, scene }).toEqual(original)
    expect(partNormalToTarget([reference(curved), principal], scene, [])).toBeNull()
    expect(partNormalToTarget([reference(curved), reference(otherCurved)], scene, [])).toBeNull()
    expect(partNormalToTarget([principal, principal], scene, [])).toBeNull()
    expect(partNormalToTarget([...refs, reference(curved)], scene, [])).toBeNull()
  })
})

describe('ordered presentation-only part selection', () => {
  it('clones retained references, toggles by exact identity and preserves order without silently dropping extra selections', () => {
    const first = reference(face('A')), second = reference(face('B')), third: PartViewReference = { kind: 'principal', plane: 'YZ' }
    const pair = togglePartViewReference([first], second, true)
    expect(pair).toEqual([first, second]); expect(pair[0]).not.toBe(first); expect(pair[1]).not.toBe(second)
    if (pair[0].kind !== 'face') throw Error('Expected first face')
    pair[0].face.key = 'changed'; expect(partViewReferenceKey(first)).toContain('face-v2|A')
    const ordered = togglePartViewReference([first, second], first, true)
    expect(ordered).toEqual([second])
    expect(togglePartViewReference(ordered, first, true)).toEqual([second, first])
    expect(togglePartViewReference([first, second], third, true)).toEqual([first, second, third])
    expect(togglePartViewReference([first, second], third, false)).toEqual([third])
  })
})
