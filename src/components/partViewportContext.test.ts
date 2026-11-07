import { expect, it } from 'vitest'
import { resolvePartContextTarget } from './partViewportContext'
import type { Feature, PickableFace, PlaneFrame } from '../cad/kernel.types'

// Original display declarations, not native geometry or pointer evidence.
const frame: PlaneFrame = { origin: [0, 0, 4], normal: [0, 0, 1], xDirection: [1, 0, 0] }
const features: Feature[] = [
  { id: 'profile', name: 'Original rectangle', type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
    profile: { kind: 'rectangle', center: [0, 0], width: 2, height: 3 } },
  { id: 'solid', name: 'Original extrusion', type: 'extrude', sketchId: 'profile', depth: 4, symmetric: false, suppressed: false },
  { id: 'plane', name: 'Original offset plane', type: 'plane', support: { kind: 'principal', plane: 'XY' }, offset: 4, reversed: false, suppressed: false },
]
const document = { name: 'Original part', features }
const face: PickableFace = { ref: { sourceFeatureId: 'solid', key: `face-v1|${'a'.repeat(64)}` }, frame, vertices: [], triangles: [] }
const edge = { ref: { sourceFeatureId: 'solid', key: `edge-v1|${'b'.repeat(64)}` }, lines: [] }
const body = { ref: { bodyId: 'body', sourceFeatureId: 'solid' }, name: 'Original body' }
function model() { return { faces: [structuredClone(face)], edges: [structuredClone(edge)], vertices: [0, 0, 0],
  planes: [{ id: 'plane', frame }], bodies: [body], bodyCatalogActive: true } }

it('resolves exact current face/edge nominees without borrowing mutable input references', () => {
  const input = model(), result = resolvePartContextTarget({ kind: 'face', reference: face.ref }, document, input, false)
  expect(result?.feature).toBe(features[1]); expect(result?.name).toBe('Original extrusion · Cara plana'); expect(result?.canSketch).toBe(true)
  expect(result?.target).toEqual({ kind: 'face', reference: face.ref })
  if (result?.target.kind !== 'face') throw Error('Missing face target')
  result.target.reference.key = 'Changed presentation target'
  expect(input.faces[0].ref).toEqual(face.ref)
  expect(resolvePartContextTarget({ kind: 'edge', reference: edge.ref }, document, input, false))
    .toMatchObject({ name: 'Original extrusion · Arista', canSketch: false, feature: features[1] })
})

it('keeps curved-face editing but withholds planar sketch creation', () => {
  const input = model(); input.faces[0].frame = null
  expect(resolvePartContextTarget({ kind: 'face', reference: face.ref }, document, input, false))
    .toMatchObject({ name: 'Original extrusion · Cara curva', canSketch: false, feature: features[1] })
})

it.each(['face', 'edge'] as const)('rejects stale, ambiguous, alias-only and unavailable %s sources', kind => {
  const input = model(), reference = kind === 'face' ? face.ref : edge.ref
  expect(resolvePartContextTarget({ kind, reference: { ...reference, sourceFeatureId: 'older' } }, document, input, true)).toBeNull()
  const duplicate = kind === 'face' ? { ...input, faces: [face, structuredClone(face)] } : { ...input, edges: [edge, structuredClone(edge)] }
  expect(resolvePartContextTarget({ kind, reference }, document, duplicate, true)).toBeNull()
  const aliases = kind === 'face' ? { ...input, faces: [{ ...face, ref: { ...face.ref, key: `face-v1|${'c'.repeat(64)}` }, aliases: [face.ref] }] }
    : { ...input, edges: [{ ...edge, ref: { ...edge.ref, key: `edge-v1|${'c'.repeat(64)}` }, aliases: [edge.ref] }] }
  expect(resolvePartContextTarget({ kind, reference }, document, aliases, true)).toBeNull()
  expect(resolvePartContextTarget({ kind, reference }, { ...document, features: features.map(f => f.id === 'solid' ? { ...f, suppressed: true } : f) }, input, true)).toBeNull()
  expect(resolvePartContextTarget({ kind, reference }, { ...document, features: [] }, input, true)).toBeNull()
})

it('requires an exact unique explicit body and preserves legacy aggregate identity separately', () => {
  const input = model()
  expect(resolvePartContextTarget({ kind: 'body', reference: body.ref }, document, input, false))
    .toMatchObject({ name: body.name, feature: features[1], canSketch: false })
  expect(resolvePartContextTarget({ kind: 'body', reference: null }, document, input, false)).toBeNull()
  expect(resolvePartContextTarget({ kind: 'body', reference: { ...body.ref, sourceFeatureId: 'older' } }, document, input, false)).toBeNull()
  expect(resolvePartContextTarget({ kind: 'body', reference: body.ref }, document, { ...input, bodies: [body, body] }, false)).toBeNull()
  expect(resolvePartContextTarget({ kind: 'body', reference: body.ref }, document,
    { ...input, bodies: [body, { ...body, ref: { ...body.ref, sourceFeatureId: 'older' } }] }, false)).toBeNull()
  const legacy = { ...input, bodyCatalogActive: false, bodies: [] }
  expect(resolvePartContextTarget({ kind: 'body', reference: body.ref }, document, legacy, false)).toBeNull()
  expect(resolvePartContextTarget({ kind: 'body', reference: null }, document, legacy, false))
    .toMatchObject({ target: { kind: 'body', reference: null }, feature: features[1], name: document.name })
  expect(resolvePartContextTarget({ kind: 'body', reference: null }, document, { ...legacy, vertices: [] }, false)).toBeNull()
})

it('requires current visible native plane nominees and never guesses an unknown or suppressed plane', () => {
  const input = model()
  expect(resolvePartContextTarget({ kind: 'plane', id: 'XY' }, document, input, true)).toBeNull()
  expect(resolvePartContextTarget({ kind: 'plane', id: 'plane' }, document, input, true)).toMatchObject({ name: features[2].name, feature: features[2] })
  expect(resolvePartContextTarget({ kind: 'plane', id: 'plane' }, document, input, false)).toBeNull()
  expect(resolvePartContextTarget({ kind: 'plane', id: 'missing' }, document, { ...input, planes: [{ id: 'missing', frame }] }, true)).toBeNull()
  expect(resolvePartContextTarget({ kind: 'plane', id: 'plane' }, document, { ...input, planes: [] }, true)).toBeNull()
  expect(resolvePartContextTarget({ kind: 'plane', id: 'plane' }, { ...document, features: features.map(f => f.id === 'plane' ? { ...f, suppressed: true } : f) }, input, true)).toBeNull()
})

it.each(['XY', 'XZ', 'YZ'] as const)('retains keyboard principal %s independently of rendered operation planes', plane => {
  expect(resolvePartContextTarget({ kind: 'principal', plane }, document, { ...model(), planes: [] }, false))
    .toEqual({ target: { kind: 'principal', plane }, name: `Plano ${plane}`, canSketch: true })
})

it('keeps background commands independent of any current feature or native model', () => {
  expect(resolvePartContextTarget({ kind: 'background' }, document, null, false)).toEqual({ target: { kind: 'background' }, name: 'Vista de la pieza', canSketch: false })
  expect(resolvePartContextTarget({ kind: 'feature', id: 'profile' }, document, null, false)).toMatchObject({ feature: features[0], canSketch: false })
  expect(resolvePartContextTarget({ kind: 'feature', id: 'missing' }, document, null, true)).toBeNull()
})
