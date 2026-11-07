import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import type { CadResult, PickableBody, PickableEdge, RevolutionAxis } from '../cad/kernel.types'
import { pickRevolutionAxis, pickRevolutionAxisChoices, revolutionAxisCandidateKey, revolutionAxisCandidates, type RevolutionAxisCandidate } from './revolutionAxisPicking'

// Original display-only scenes. Pixel oracles below use a 20 mm / 200 px orthographic view,
// so a point (x,y) maps independently to (100 + 10x, 100 - 10y). No kernel authority is inferred.
const viewport = { width: 200, height: 200 }
function camera() {
  const result = new THREE.OrthographicCamera(-10, 10, 10, -10, .1, 100)
  result.position.set(0, 0, 20); result.lookAt(0, 0, 0)
  result.updateProjectionMatrix(); result.updateMatrixWorld()
  return result
}
function model(patch: Partial<CadResult> = {}): CadResult {
  return { vertices: [], normals: [], triangles: [], edgeLines: [], edges: [], volume: 0,
    bounds: { min: [-5, -5, -5], max: [5, 5, 5] }, warnings: [], featureErrors: [], ...patch }
}
function body(bodyId: string, edges: PickableEdge[]): PickableBody {
  return { ref: { bodyId, sourceFeatureId: 'solid-state' }, createdByFeatureId: 'creator', name: bodyId,
    vertices: [], normals: [], triangles: [], edgeLines: [], edges, faces: [], volume: 0,
    bounds: { min: [-5, -5, -5], max: [5, 5, 5] } }
}
function candidate(id: string, lines: number[], material = false): RevolutionAxisCandidate {
  return { key: id, axis: { kind: 'sketch-line', entityId: id }, lines, label: id, material }
}
const straight: PickableEdge = { ref: { sourceFeatureId: 'solid-state', key: 'original-edge' }, lines: [2, -3, 0, 2, 3, 0] }

describe('explicit overlapping choices and distant datums', () => {
  it('retains both exact body owners for a user choice instead of silently selecting one', () => {
    const axes = revolutionAxisCandidates(model({ bodyCatalogActive: true,
      bodies: [body('a', [straight]), body('b', [straight])] }), 'profile').filter(value => value.material)
    const selected = pickRevolutionAxisChoices(camera(), axes, { x: 120, y: 100 }, viewport, null)
    expect(selected).toEqual(axes)
    expect(selected.map(value => value.label)).toEqual(['Arista · a · a', 'Arista · b · b'])
    expect(pickRevolutionAxis(camera(), axes, { x: 120, y: 100 }, viewport, null)).toBeNull()
  })
  it.each(['sketch', 'legacy'] as const)('keeps world datums visible near a distant %s scene', source => {
    const distant = source === 'sketch' ? model({ sketches: [{ id: 'profile', lines: [5, 997, 0, 9, 1003, 0], constructionLines: [] }] })
      : model({ bounds: { min: [5, 997, 0], max: [9, 1003, 0] } })
    const axes = revolutionAxisCandidates(distant, 'profile').filter(value => value.axis.kind === 'principal-axis' && value.axis.axis === 'Y')
    const view = camera(); view.position.set(0, 1000, 20); view.lookAt(0, 1000, 0); view.updateMatrixWorld()
    // World (0,1000,0) is exactly the centre of this independently positioned view.
    expect(pickRevolutionAxis(view, axes, { x: 100, y: 100 }, viewport, null)).toBe(axes[0])
  })
})

describe('revolution axis declaration candidates', () => {
  it('requires a successful prefix scene and never substitutes the global edge namespace for explicit body owners', () => {
    expect(revolutionAxisCandidates(null, 'profile')).toEqual([])
    expect(revolutionAxisCandidates(model({ featureErrors: [{ id: 'bad', message: 'Original failure' }] }), 'profile')).toEqual([])
    const a = body('axis-body-a', [straight]), b = body('axis-body-b', [straight])
    const scene = model({ bodyCatalogActive: true, bodies: [a, b], edges: [{ ...straight, ref: { ...straight.ref, key: 'aggregate-only' } }] })
    const before = structuredClone(scene)
    const axes = revolutionAxisCandidates(scene, 'profile').filter(value => value.material)
    expect(axes.map(value => value.axis)).toEqual([
      { kind: 'linear-edge', body: a.ref, edge: straight.ref },
      { kind: 'linear-edge', body: b.ref, edge: straight.ref },
    ])
    expect(axes[0].key).not.toBe(axes[1].key)
    expect(axes[0].axis).not.toHaveProperty('origin')
    expect(axes[0].axis).not.toHaveProperty('direction')
    expect(scene).toEqual(before)
    expect(revolutionAxisCandidates(model({ bodies: [a], edges: [straight] }), 'profile').filter(value => value.material).map(value => value.axis))
      .toEqual([{ kind: 'linear-edge', body: null, edge: straight.ref }])
  })

  it('does not reinterpret a tessellated native curve or invent individual edge identities for its segments', () => {
    const arc: PickableEdge = { ref: { sourceFeatureId: 'curved-state', key: 'original-curved-edge' },
      lines: [0, 0, 0, 1, 1, 0, 1, 1, 0, 2, 0, 0] }
    const axes = revolutionAxisCandidates(model({ edges: [arc] }), 'profile').filter(value => value.material)
    expect(axes).toHaveLength(1)
    expect(axes[0].lines).toEqual(arc.lines)
    expect(axes[0].axis).toEqual({ kind: 'linear-edge', body: null, edge: arc.ref })
    // This is only an edge-query candidate. Native LINE inspection must still reject the curve.
  })

  it('emits only identified solved sketch LINE witnesses, retaining construction and external ownership', () => {
    const scene = model({ sketches: [
      { id: 'profile', lines: [0, 0, 0, 1, 1, 0], constructionLines: [5, -3, 0, 5, 3, 0], lineEntities: [
        { entityId: 'construction-axis', start: [5, -3, 0], end: [5, 3, 0], construction: true },
        { entityId: 'duplicate', start: [0, 0, 0], end: [1, 0, 0], construction: false },
        { entityId: 'duplicate', start: [2, 0, 0], end: [3, 0, 0], construction: true },
      ] },
      { id: 'external-axis-sketch', lines: [9, -3, 0, 9, 3, 0], constructionLines: [], lineEntities: [
        { entityId: 'construction-axis', start: [9, -3, 0], end: [9, 3, 0], construction: false },
      ] },
      { id: 'arc-only', lines: [0, 0, 0, 1, 1, 0, 1, 1, 0, 2, 0, 0], constructionLines: [] },
    ] })
    const axes = revolutionAxisCandidates(scene, 'profile').filter(value => value.axis.kind === 'sketch-line' || value.axis.kind === 'external-sketch-line')
    expect(axes.map(value => [value.axis, value.lines])).toEqual([
      [{ kind: 'sketch-line', entityId: 'construction-axis' }, [5, -3, 0, 5, 3, 0]],
      [{ kind: 'external-sketch-line', sketchId: 'external-axis-sketch', entityId: 'construction-axis' }, [9, -3, 0, 9, 3, 0]],
    ])
    expect(axes[0].key).not.toBe(axes[1].key)
  })

  it('places world axes at the exact origin and local axes at the solved translated and rotated sketch frame', () => {
    const axes = revolutionAxisCandidates(model({ sketches: [{ id: 'profile', lines: [], constructionLines: [],
      frame: { origin: [4, -2, 1], normal: [0, 0, 1], xDirection: [0, 1, 0] } }] }), 'profile')
    expect(axes.map(value => [value.axis, value.lines])).toEqual([
      [{ kind: 'principal-axis', axis: 'X' }, [-45, 0, 0, 45, 0, 0]],
      [{ kind: 'principal-axis', axis: 'Y' }, [0, -45, 0, 0, 45, 0]],
      [{ kind: 'principal-axis', axis: 'Z' }, [0, 0, -45, 0, 0, 45]],
      [{ kind: 'sketch-axis', axis: 'x' }, [4, -47, 1, 4, 43, 1]],
      [{ kind: 'sketch-axis', axis: 'y' }, [49, -2, 1, -41, -2, 1]],
    ])
  })

  it('uses semantic reference fields rather than object insertion order for declaration identity', () => {
    const a: RevolutionAxis = { kind: 'linear-edge', body: { bodyId: 'body', sourceFeatureId: 'body-state' },
      edge: { sourceFeatureId: 'edge-state', key: 'edge' } }
    const b: RevolutionAxis = { edge: { key: 'edge', sourceFeatureId: 'edge-state' },
      body: { sourceFeatureId: 'body-state', bodyId: 'body' }, kind: 'linear-edge' }
    expect(revolutionAxisCandidateKey(a)).toBe(revolutionAxisCandidateKey(b))
    expect(revolutionAxisCandidateKey(a)).not.toBe(revolutionAxisCandidateKey({ ...a, body: null }))
    expect(revolutionAxisCandidateKey(a)).not.toBe(revolutionAxisCandidateKey({ ...a, body: { ...a.body!, bodyId: 'other-body' } }))
    expect(revolutionAxisCandidateKey({ kind: 'external-sketch-line', sketchId: 'source', entityId: 'line' }))
      .toBe(revolutionAxisCandidateKey({ entityId: 'line', kind: 'external-sketch-line', sketchId: 'source' }))
  })

  it('rejects malformed display segments without changing declaration ownership', () => {
    const axes = revolutionAxisCandidates(model({ edges: [
      { ref: { ...straight.ref, key: 'short' }, lines: [0, 0, 0] },
      { ref: { ...straight.ref, key: 'partial' }, lines: [0, 0, 0, 1, 1, 1, 2] },
      { ref: { ...straight.ref, key: 'nonfinite' }, lines: [0, 0, NaN, 1, 1, 1] },
    ] }), 'profile')
    expect(axes.filter(value => value.material)).toEqual([])
  })
})

describe('projected revolution axis picking', () => {
  it('selects a displayed line using an independently known pixel position and endpoint tolerance', () => {
    const axis = candidate('line', [2, -3, 0, 2, 3, 0]), view = camera()
    expect(pickRevolutionAxis(view, [axis], { x: 120, y: 100 }, viewport, null)).toBe(axis)
    expect(pickRevolutionAxis(view, [axis], { x: 128, y: 100 }, viewport, null)).toBe(axis)
    expect(pickRevolutionAxis(view, [axis], { x: 128.01, y: 100 }, viewport, null)).toBeNull()
    expect(pickRevolutionAxis(view, [axis], { x: 120, y: 62.01 }, viewport, null)).toBe(axis)
    expect(pickRevolutionAxis(view, [axis], { x: 120, y: 61.99 }, viewport, null)).toBeNull()
  })

  it('uses the current camera zoom, orientation and viewport dimensions', () => {
    const axis = candidate('line', [2, -3, 0, 2, 3, 0]), view = camera()
    view.zoom = 2; view.updateProjectionMatrix()
    expect(pickRevolutionAxis(view, [axis], { x: 140, y: 100 }, viewport, null)).toBe(axis)
    expect(pickRevolutionAxis(view, [axis], { x: 120, y: 100 }, viewport, null)).toBeNull()
    view.zoom = 1; view.updateProjectionMatrix()
    expect(pickRevolutionAxis(view, [axis], { x: 240, y: 100 }, { width: 400, height: 200 }, null)).toBe(axis)
    view.position.set(20, 0, 0); view.lookAt(0, 0, 0); view.updateMatrixWorld()
    const sideways = candidate('sideways', [0, -3, -2, 0, 3, -2])
    expect(pickRevolutionAxis(view, [sideways], { x: 120, y: 100 }, viewport, null)).toBe(sideways)
  })

  it('keeps the visible clipped portion pickable when a long axis crosses the near plane', () => {
    const axis = candidate('crosses-near', [2, -3, -1, 2, 3, 30])
    // At y=-1 the independent segment interpolation gives z=28/3, in front of the camera and beyond near.
    expect(pickRevolutionAxis(camera(), [axis], { x: 120, y: 110 }, viewport, null)).toBe(axis)
    const behind = candidate('behind-near', [2, -3, 30, 2, 3, 40])
    expect(pickRevolutionAxis(camera(), [behind], { x: 120, y: 110 }, viewport, null)).toBeNull()
  })

  it('rejects hidden material edges while retaining visible edges and guides drawn through material', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(6, 6, 2), new THREE.MeshBasicMaterial())
    mesh.position.z = 1; mesh.updateMatrixWorld()
    const hidden = candidate('hidden', [2, -2, 0, 2, 2, 0], true)
    const front = candidate('front', [2, -2, 2, 2, 2, 2], true)
    const guide = candidate('guide', [2, -2, 0, 2, 2, 0])
    try {
      expect(pickRevolutionAxis(camera(), [hidden], { x: 120, y: 100 }, viewport, mesh)).toBeNull()
      expect(pickRevolutionAxis(camera(), [front], { x: 120, y: 100 }, viewport, mesh)).toBe(front)
      expect(pickRevolutionAxis(camera(), [guide], { x: 120, y: 100 }, viewport, mesh)).toBe(guide)
    } finally { mesh.geometry.dispose(); mesh.material.dispose() }
  })

  it('does not guess between coincident reference owners, but picks an independently closer line', () => {
    const a = candidate('owner-a', [2, -3, 0, 2, 3, 0]), b = candidate('owner-b', [...a.lines])
    expect(pickRevolutionAxis(camera(), [a, b], { x: 120, y: 100 }, viewport, null)).toBeNull()
    const closer = candidate('closer', [2.5, -3, 0, 2.5, 3, 0])
    expect(pickRevolutionAxis(camera(), [a, closer], { x: 125, y: 100 }, viewport, null)).toBe(closer)
    const front = candidate('front-owner', [2, -3, 2, 2, 3, 2])
    expect(pickRevolutionAxis(camera(), [a, front], { x: 120, y: 100 }, viewport, null)).toBe(front)
  })

  it('requires a drawable projection and valid pointer bounds instead of selecting from a collapsed axis', () => {
    const alongView = candidate('along-view', [0, 0, -4, 0, 0, 4]), axis = candidate('line', [2, -3, 0, 2, 3, 0])
    expect(pickRevolutionAxis(camera(), [alongView], { x: 100, y: 100 }, viewport, null)).toBeNull()
    for (const pointer of [{ x: -1, y: 100 }, { x: 201, y: 100 }, { x: 120, y: -1 }, { x: 120, y: 201 }])
      expect(pickRevolutionAxis(camera(), [axis], pointer, viewport, null)).toBeNull()
    expect(pickRevolutionAxis(camera(), [axis], { x: 120, y: 100 }, { width: 0, height: 200 }, null)).toBeNull()
    expect(pickRevolutionAxis(camera(), [axis], { x: 120, y: 100 }, { width: 200, height: 0 }, null)).toBeNull()
  })
})
